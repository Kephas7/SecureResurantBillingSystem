import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { DateRangeDto } from './reports.dto';

@Controller('reports')
@Roles('ADMIN', 'MANAGER')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  async getSales(@Query() query: DateRangeDto) {
    return this.reportsService.getSalesReport(query.startDate, query.endDate);
  }

  @Get('inventory')
  async getInventory() {
    return this.reportsService.getInventoryReport();
  }

  @Get('staff')
  async getStaff(@Query() query: DateRangeDto) {
    return this.reportsService.getStaffReport(query.startDate, query.endDate);
  }

  @Get('refunds')
  async getRefunds(@Query() query: DateRangeDto) {
    return this.reportsService.getRefundReport(query.startDate, query.endDate);
  }
}
