import { IsEmail, IsNotEmpty, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

// Password max length is capped at 72 bytes because Argon2/bcrypt silently
// truncate input beyond that point - without this check a user could set a
// 100-character password believing all of it matters, when only the first
// 72 bytes are actually hashed. Enforcing the limit at validation makes the
// real constraint visible instead of a silent surprise at auth time.
const PASSWORD_MAX_LENGTH = 72;

// Requires at least one uppercase, one lowercase, one digit and one special
// character - baseline complexity per OWASP ASVS/NIST guidance for
// systems that still enforce composition rules.
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: 'password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: 'newPassword must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  newPassword!: string;
}

export class VerifyMfaDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  token!: string;
}
