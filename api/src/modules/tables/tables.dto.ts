import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TableStatus } from '@prisma/client';

export class CreateTableDto {
  @IsInt()
  @Min(1)
  number!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  capacity!: number;
}

export class UpdateTableDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  number?: number;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  capacity?: number;

  @IsEnum(TableStatus)
  @IsOptional()
  status?: TableStatus;
}

export class AssignTableDto {
  @IsUUID()
  waiterId!: string;
}
