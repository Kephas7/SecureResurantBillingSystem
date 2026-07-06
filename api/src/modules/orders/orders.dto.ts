import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class OrderItemDto {
  @IsUUID()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  notes?: string;
}

export class CreateOrderDto {
  @IsUUID()
  tableId!: string;

  // Without @Type(() => OrderItemDto) here, class-transformer has no way
  // to know what class to instantiate each array element as, so
  // @ValidateNested would silently validate plain objects against no
  // schema at all - a common misconfiguration that lets malformed order
  // items (wrong types, missing fields) reach the database untouched.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class UpdateOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
