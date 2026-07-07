import { IsDateString } from 'class-validator';

// Date range inputs are validated as ISO date strings before any DB
// query is constructed. Raw date strings are never interpolated into
// queries - Prisma parameterises all inputs, preventing SQL injection
// via date fields. Ordering (startDate <= endDate) is checked in the
// service, since that's a cross-field business rule rather than a
// per-field format check.
export class DateRangeDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
