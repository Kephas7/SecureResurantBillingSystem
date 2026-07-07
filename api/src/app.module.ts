import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { TablesModule } from "./modules/tables/tables.module";
import { MenuModule } from "./modules/menu/menu.module";
import { AuditModule } from "./modules/audit/audit.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { validateEnv } from "./config/env.validation";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { SessionGuard } from "./common/guards/session.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    // validate runs at startup and crashes immediately if a required
    // secret is missing/malformed - see config/env.validation.ts for the
    // fail-fast rationale (OWASP A05: Security Misconfiguration).
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global baseline rate limit; tighter limits applied per-route on
    // sensitive endpoints (e.g. /auth/login) in the auth module.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TablesModule,
    MenuModule,
    AuditModule,
    OrdersModule,
    InventoryModule,
    BillingModule,
    ReportsModule,
  ],
  controllers: [],
  providers: [
    // Guard order matters: rate-limit first (cheapest check, blocks abuse
    // before touching the DB), then session auth, then DB-backed role
    // check - each guard only runs if the previous one passed.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
