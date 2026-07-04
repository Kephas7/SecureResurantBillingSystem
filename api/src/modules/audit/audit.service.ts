import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_LIMIT = 100;

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  actorEmail: string | null;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findLogs(
    page: number,
    limit: number,
    action?: string,
    actorId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PaginatedAuditLogs> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (startDate) createdAtFilter.gte = new Date(startDate);
    if (endDate) createdAtFilter.lte = new Date(endDate);

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
      ...(startDate || endDate ? { createdAt: createdAtFilter } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        // Only the actor's email is ever joined in - never passwordHash,
        // passwordHistory, mfaSecretEnc, or any other User field.
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: AuditLogEntry[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: row.metadata,
      createdAt: row.createdAt,
      actorEmail: row.actor?.email ?? null,
    }));

    return {
      data,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findDistinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });

    return rows.map((row) => row.action);
  }
}
