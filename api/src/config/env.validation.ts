import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SESSION_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsInt()
  @Min(1)
  REDIS_PORT!: number;

  @IsString()
  @IsNotEmpty()
  REDIS_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  WEB_ORIGIN!: string;
}

// Environment variable validation runs at startup and crashes the
// application immediately if required secrets are missing or malformed.
// This prevents the common misconfiguration where an app starts
// successfully but silently uses undefined secrets, which could lead to
// the session secret being undefined (disabling session security) or
// the database URL being wrong (falling back to a default, or connecting
// to the wrong database entirely). Fail-fast is safer than fail-silently
// (OWASP A05: Security Misconfiguration).
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Missing or invalid environment variables:\n${errors.toString()}`);
  }

  return validatedConfig;
}
