import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService, PaginatedAuditLogs } from './audit.service';
import { QueryAuditLogsDto } from './audit.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

// Admin-only: audit logs can reveal every user's activity pattern
// (login times, IPs, actions taken), which is itself sensitive
// information beyond what any single non-admin role needs to see.
@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  async findLogs(@Query() query: QueryAuditLogsDto): Promise<PaginatedAuditLogs> {
    return this.auditService.findLogs(
      query.page ?? DEFAULT_PAGE,
      query.limit ?? DEFAULT_LIMIT,
      query.action,
      query.actorId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('logs/actions')
  async findDistinctActions(): Promise<string[]> {
    return this.auditService.findDistinctActions();
  }
}
