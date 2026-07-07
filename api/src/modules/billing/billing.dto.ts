import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE'] as const;

export class CreateInvoiceDto {
  @IsUUID()
  orderId!: string;

  @IsString()
  @IsIn(PAYMENT_METHODS)
  @IsNotEmpty()
  paymentMethod!: (typeof PAYMENT_METHODS)[number];

  // Minimum 0 - a negative discount would inflate the total above the
  // subtotal. This is a business logic security control preventing a
  // cashier from issuing a negative discount to increase a bill
  // fraudulently or to trigger an overflow/underflow in the total
  // calculation.
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;
}

export class ApplyDiscountDto {
  @IsNumber()
  @Min(0)
  discountAmount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}

export class RequestRefundDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
