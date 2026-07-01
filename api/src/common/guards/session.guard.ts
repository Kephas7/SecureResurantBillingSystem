import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as reachable without an authenticated session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Zero-trust, default-deny session check.
 *
 * The common insecure pattern is "protect routes by remembering to add a
 * guard to each one" - new routes are unprotected by default and a
 * forgotten decorator silently exposes an endpoint. This guard inverts
 * that: it is registered globally (APP_GUARD in AppModule) so every route
 * requires a valid, MFA-verified session unless it explicitly opts out
 * with @Public(). Forgetting to annotate a new route fails closed, not open.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    return true;
  }
}
