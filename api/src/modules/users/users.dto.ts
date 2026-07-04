import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Mirrors the rule in api/src/modules/auth/auth.dto.ts - kept as its own
// small constant here rather than importing across modules for two lines.
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

// ADMIN is deliberately excluded from both DTOs below - see the comment
// on UpdateUserDto.roleName for the rationale.
const ASSIGNABLE_ROLES = ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: 'password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  // Admins cannot create another Admin via this endpoint - promoting to
  // ADMIN requires direct database access, which keeps the highest
  // privilege level out of reach of a compromised or malicious admin
  // session alone (separation of duties).
  @IsString()
  @IsIn(ASSIGNABLE_ROLES)
  roleName!: (typeof ASSIGNABLE_ROLES)[number];
}

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  fullName?: string;

  // roleName excludes ADMIN to prevent privilege escalation - an Admin
  // cannot promote another user to Admin through this endpoint. Direct
  // DB access would be required, which is an intentional friction point
  // for the single highest-privilege role.
  @IsString()
  @IsIn(ASSIGNABLE_ROLES)
  @IsOptional()
  roleName?: (typeof ASSIGNABLE_ROLES)[number];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
