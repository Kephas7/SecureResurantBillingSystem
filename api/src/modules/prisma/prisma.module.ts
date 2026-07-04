import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';

// @Global() so every feature module (auth, orders, invoices, ...) can inject
// PrismaService and AuditLogService without re-importing this module
// everywhere. AuditLogService lives here (rather than its own module)
// since it only depends on PrismaService and every module that touches
// the DB also needs to write audit entries.
@Global()
@Module({
  providers: [PrismaService, AuditLogService],
  exports: [PrismaService, AuditLogService],
})
export class PrismaModule {}
