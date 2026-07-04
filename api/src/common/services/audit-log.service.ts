import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';

// Shared by every feature service (Users, Tables, Menu, Auth, ...) so the
// "write an audit entry for every mutation" rule has one implementation
// instead of being copy-pasted per module. Fire-and-forget from the
// caller's perspective is NOT what this does - callers should still
// `await` it so the entry is written before the response goes out - but
// a DB failure here is caught and logged locally rather than failing the
// whole request, since losing an audit row must never block a legitimate
// user action.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(
    actorId: string | null,
    action: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          resourceId,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to write audit log for action "${action}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
