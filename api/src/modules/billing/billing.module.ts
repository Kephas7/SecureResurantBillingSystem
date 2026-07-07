import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [InventoryModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
