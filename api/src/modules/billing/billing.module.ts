import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [InventoryModule],
  controllers: [BillingController],
  providers: [BillingService, StripeService],
  exports: [BillingService],
})
export class BillingModule {}
