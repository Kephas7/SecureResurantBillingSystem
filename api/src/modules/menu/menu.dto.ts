import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  name?: string;
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100000)
  price!: number;

  @IsUUID()
  categoryId!: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  // Set via the separate POST /upload/menu-item-image endpoint, which
  // returns this relative path - never accepted as a raw client-supplied
  // URL/filesystem path here (that would let a client point imageUrl at
  // an arbitrary external URL or attempt SSRF-adjacent tricks). MaxLength
  // is generous but bounded since this still flows through the same
  // global request-body validation as every other field.
  @IsString()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;
}

export class UpdateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100000)
  @IsOptional()
  price?: number;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;
}
