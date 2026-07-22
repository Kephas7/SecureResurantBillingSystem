import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without an authenticated session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mfaVerified?: boolean;
    passwordExpired?: boolean;
  }
}

/**
 * Zero-trust, default-deny session check.
 * The common insecure pattern is "protect routes by remembering to add a
 * guard to each one" - new routes are unprotected by default and a
 * forgotten decorator silently exposes an endpoint. This guard inverts
 * that: it is registered globally (APP_GUARD in AppModule) so every route
 * requires a valid, MFA-verified session unless it explicitly opts out
 * with @Public(). Forgetting to annotate a new route fails closed, not open.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!request.session?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    if (request.session.mfaVerified === false) {
      throw new UnauthorizedException('MFA verification required');
    }

    /**
     * SECURITY: Password expiry enforcement.
     * NIST SP 800-63B recommends against mandatory rotation
     * without evidence of compromise, but the assignment brief
     * explicitly requires 90-day expiry. We implement it here
     * as a session-layer check rather than blocking login
     * entirely — the user can still authenticate but is
     * redirected to change their password before proceeding.
     *
     * The check is skipped for the password-change endpoint
     * itself (otherwise the user could never change their
     * password) and for the logout endpoint.
     */
    const PASSWORD_EXPIRY_DAYS = 90;
    const EXEMPT_PATHS = ['/auth/change-password', '/auth/logout', '/auth/me'];

    const requestPath = request.path;
    const isExempt = EXEMPT_PATHS.some((p) => requestPath.startsWith(p));

    if (!isExempt && request.session.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: request.session.userId },
        select: { passwordChangedAt: true },
      });

      if (user) {
        const daysSinceChange = Math.floor(
          (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSinceChange >= PASSWORD_EXPIRY_DAYS) {
          // Set a flag on the session so the frontend knows
          // to show the forced change screen
          request.session.passwordExpired = true;

          await this.prisma.auditLog
            .create({
              data: {
                actorId: request.session.userId,
                action: 'PASSWORD_EXPIRED',
                resource: 'User',
                resourceId: request.session.userId,
                metadata: {
                  daysSinceChange,
                  expiryThresholdDays: PASSWORD_EXPIRY_DAYS,
                },
              },
            })
            // Fire and forget — don't block the request
            .catch(() => {});

          // SECURITY FIX: enforce expiry at the API layer.
          // Previously this only set a session flag and relied on
          // the frontend to redirect — a direct API call would
          // bypass enforcement entirely, contradicting the
          // zero-trust default-deny design of this guard.
          // Throwing here ensures expired passwords are enforced
          // regardless of client behaviour.
          // (NIST SP 800-63B — reauthentication requirements)
          throw new ForbiddenException(
            JSON.stringify({
              code: 'PASSWORD_EXPIRED',
              message: 'Your password has expired. Please change it to continue.',
            }),
          );
        } else {
          request.session.passwordExpired = false;
        }
      }
    }

    return true;
  }
}
