// Module augmentation must live at module top-level (not inside a class/
// function) so TypeScript merges it into the shared express-session types.
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mfaVerified?: boolean;
  }
}

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../modules/prisma/prisma.service';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Append-only audit trail for every state-changing request.
 *
 * WHY: incident response needs a reliable "who did what, from where, when"
 * record that survives even if the acting request later fails or the
 * session is compromised. It also underpins detection of brute-force
 * login attempts and IDOR probing (repeated 403/404s against sequential
 * resource IDs from the same actor/IP).
 *
 * GET/HEAD/OPTIONS are skipped: they are high-volume and, since this app
 * has no side effects on reads, low security value to log per-request.
 *
 * The request body is NEVER logged - it may contain passwords, card
 * numbers or other sensitive fields. Only method/path/status/actor/IP/UA
 * are recorded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!AUDITED_METHODS.has(request.method)) {
      return next.handle();
    }

    const actorId = request.session?.userId ?? null;
    const ipAddress = request.ip ?? null;
    const userAgent = request.headers['user-agent'] ?? null;
    const action = `${request.method} ${request.route?.path ?? request.path}`;

    return next.handle().pipe(
      tap({
        next: () => this.writeAuditLog(actorId, action, ipAddress, userAgent, true),
        error: () => this.writeAuditLog(actorId, action, ipAddress, userAgent, false),
      }),
    );
  }

  // Fire-and-forget: audit logging must never slow down or fail the
  // actual HTTP response, so this is intentionally not awaited by callers.
  private writeAuditLog(
    actorId: string | null,
    action: string,
    ipAddress: string | null,
    userAgent: string | null,
    success: boolean,
  ): void {
    this.prisma.auditLog
      .create({
        data: {
          actorId,
          action,
          ipAddress,
          userAgent,
          metadata: { success },
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to write audit log for action "${action}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }
}
