import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;

  @IsNumber()
  @Min(0)
  stockQuantity!: number;

  @IsNumber()
  @Min(0)
  lowStockThreshold!: number;

  @IsUUID()
  @IsOptional()
  supplierId?: string;
}

export class UpdateIngredientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;

  @IsUUID()
  @IsOptional()
  supplierId?: string;
}

export class AdjustStockDto {
  // Positive = restock, negative = manual removal (waste, correction).
  @IsNumber()
  adjustment!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  contactInfo?: string;
}

export class UpdateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  contactInfo?: string;
}
