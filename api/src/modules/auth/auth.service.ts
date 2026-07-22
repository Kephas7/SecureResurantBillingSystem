import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { IpBlockService } from './ip-block.service';

// Max failed attempts before an account is temporarily locked. OWASP ASVS
// V2.2.1 recommends locking or heavily throttling after a small, fixed
// number of consecutive failures to blunt online brute-force/credential-
// stuffing attacks without permanently locking users out on a typo.
const MAX_FAILED_ATTEMPTS = 5;

// Lockout duration once MAX_FAILED_ATTEMPTS is reached. Long enough to make
// brute-forcing impractical, short enough that a legitimate user isn't
// stuck waiting on support to unlock their own account.
const LOCKOUT_MINUTES = 15;

// Number of previous password hashes checked to block re-use (NIST SP
// 800-63B discourages allowing recently-used passwords).
const PASSWORD_HISTORY_LIMIT = 5;

// Default role assigned to accounts created via register() when no more
// specific role is supplied. Looked up by name (never a hardcoded UUID) so
// it stays correct across environments/reseeds.
const DEFAULT_ROLE_NAME = 'WAITER';

// Mirrors the value enforced in SessionGuard - a password not changed
// within this window is flagged so the frontend can force a change.
const PASSWORD_EXPIRY_DAYS = 90;

// A syntactically-valid argon2id hash with no corresponding real password.
// Used to burn CPU time on unknown-email login attempts so that the
// response timing for "no such user" matches "wrong password" - otherwise
// an attacker could enumerate valid emails by measuring response latency.
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$XyHKupWCz47ORMWta9N93Q$DbwCxK52Y1kaEhxQHkmC1MAcgG3/6SihMdFHMh1qC6s';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mfaEnabled: boolean;
  passwordExpired: boolean;
  passwordChangedAt: Date;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipBlockService: IpBlockService,
  ) {}

  async register(dto: RegisterDto): Promise<{ id: string; email: string }> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { name: DEFAULT_ROLE_NAME } });
    if (!role) {
      throw new BadRequestException(`Default role "${DEFAULT_ROLE_NAME}" is not configured`);
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        passwordHistory: [passwordHash],
        fullName: dto.fullName,
        roleId: role.id,
      },
      select: { id: true, email: true },
    });

    await this.writeAuditLog(user.id, 'USER_REGISTERED', 'User', user.id);

    return { id: user.id, email: user.email };
  }

  async login(
    dto: LoginDto,
    ipAddress: string,
  ): Promise<{ userId: string; requiresMfa: boolean; role: string }> {
    // Check IP block FIRST — before any DB work. A blocked IP is rejected
    // outright regardless of whether the credentials it's presenting are
    // even valid (see Test 2 in the IP-blocking test plan) - this is what
    // stops a credential-stuffing run that rotates through valid-looking
    // accounts once it's already tripped lockout on enough of them.
    const isBlocked = await this.ipBlockService.isBlocked(ipAddress);
    if (isBlocked) {
      const ttl = await this.ipBlockService.getBlockTtl(ipAddress);
      const minutesLeft = Math.ceil(ttl / 60);

      await this.writeAuditLog(null, 'IP_BLOCKED_LOGIN_ATTEMPT', 'Auth', undefined, {
        ipAddress,
        minutesRemaining: minutesLeft,
      });

      throw new ForbiddenException(
        `Too many failed attempts from this location. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const captchaSecret = process.env.CAPTCHA_SECRET_KEY;

    if (captchaSecret) {
      if (!dto.captchaToken) {
        throw new BadRequestException('CAPTCHA token required');
      }

      const captchaValid = await this.verifyCaptcha(dto.captchaToken);
      if (!captchaValid) {
        throw new BadRequestException('CAPTCHA verification failed');
      }
    }

    const email = dto.email.toLowerCase();

    // Explicit select: only the fields login actually needs are fetched -
    // passwordHash to verify, lockedUntil/isActive/mfaEnabled to check
    // account state - never passwordHistory or mfaSecretEnc (OWASP A02:
    // Cryptographic Failures - sensitive data exposure).
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        lockedUntil: true,
        isActive: true,
        mfaEnabled: true,
        role: { select: { name: true } },
      },
    });

    if (!user) {
      // Timing-attack mitigation: always pay the cost of an argon2.verify()
      // call, even when there is no user to check against, so that
      // "unknown email" and "wrong password" take statistically the same
      // amount of time and can't be used to enumerate valid accounts.
      await argon2.verify(DUMMY_ARGON2_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      // SECURITY FIX — FINDING-003
      // Previously this branch threw a distinct ForbiddenException
      // ("Account is locked...") that a non-existent email could
      // never trigger, letting an attacker confirm account existence
      // by brute-forcing 5 attempts and checking which error came
      // back. We now return the same exception type/status
      // (UnauthorizedException/401) as invalid credentials, with a
      // message that does not confirm the account exists while still
      // being useful to a legitimate user who knows they have one.
      // (OWASP Authentication Cheat Sheet — Protect Against
      //  Username Enumeration)
      //
      // This is a partial mitigation, not a complete one: a
      // determined attacker can still infer account existence by
      // noticing that the "try again in N minute(s)" detail only
      // ever appears for real accounts. Closing that gap fully would
      // require applying lockout-shaped delays to unknown emails too
      // (see FINDING-004's discussion of the same trade-off for
      // password reset), which was judged to degrade legitimate-user
      // UX more than the residual risk here justifies.
      throw new UnauthorizedException(
        `Invalid credentials or account temporarily locked. If you have an account, try again in ${minutesRemaining} minute(s).`,
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is disabled');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);

    if (!valid) {
      await this.handleFailedLogin(user.id, ipAddress);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true },
    });

    await this.writeAuditLog(user.id, 'LOGIN_SUCCESS', 'User', user.id, { ip: ipAddress });

    return { userId: user.id, requiresMfa: user.mfaEnabled, role: user.role.name };
  }

  async logout(userId: string): Promise<void> {
    await this.writeAuditLog(userId, 'LOGOUT', 'User', userId);
  }

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        mfaEnabled: true,
        passwordChangedAt: true,
        createdAt: true,
        role: { select: { name: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const daysSinceChange = Math.floor(
      (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const passwordExpired = daysSinceChange >= PASSWORD_EXPIRY_DAYS;

    // Only ever return fields safe to hand to the browser - never
    // passwordHash, passwordHistory, or mfaSecretEnc.
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      mfaEnabled: user.mfaEnabled,
      passwordExpired,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    // where: { id: userId } - always the caller's own session id, never a
    // value from the request body, so there is no way to target another
    // user's row through this endpoint (see UpdateProfileDto for the
    // mass-assignment/self-escalation rationale on the field whitelist).
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
      },
      select: { id: true },
    });

    await this.writeAuditLog(userId, 'PROFILE_UPDATED', 'User', userId, {
      updatedFields: Object.keys(dto),
    });

    return this.getMe(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, passwordHistory: true },
    });
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.assertNotRecentPassword(dto.newPassword, user.passwordHistory);

    const newHash = await this.hashPassword(dto.newPassword);
    const passwordHistory = [newHash, ...user.passwordHistory].slice(0, PASSWORD_HISTORY_LIMIT);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        passwordHistory,
        passwordChangedAt: new Date(),
      },
      select: { id: true },
    });

    await this.writeAuditLog(userId, 'PASSWORD_CHANGED', 'User', userId);
  }

  // SECURITY FIX — FINDING-004
  // The response body was already identical for real vs. non-existent
  // emails (see the OWASP ASVS 2.2 comment below), but the real-email
  // path does real work (DB read + write, hashing) while the
  // non-existent-email path returned immediately - a timing side
  // channel that let an attacker distinguish the two by measuring
  // response latency instead of reading the body. Both paths now run
  // through the same `finally` block, which pads the response out to
  // a fixed minimum duration, so the two cases are equalised in time
  // as well as in content.
  // (OWASP Authentication Cheat Sheet — Prevent Timing Attacks)
  async requestPasswordReset(email: string): Promise<void> {
    const MIN_RESPONSE_MS = 500;
    const startTime = Date.now();

    try {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });

      // SECURITY: always return success whether or not the email exists, so
      // this endpoint can't be used to enumerate registered accounts (OWASP
      // ASVS 2.2 - authentication responses must not disclose which
      // identifiers are valid). The caller only ever sees a generic
      // "if that email is registered..." message regardless of outcome.
      if (!user) {
        return;
      }

      // Raw token is never stored - only its SHA-256 hash. This means a
      // database breach does not expose valid reset tokens, the same
      // principle as password hashing applied to a short-lived token.
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      // Stub: in production this would email the raw token as a reset link.
      // Logged here (dev only) so the flow can be exercised end-to-end
      // without a real mail provider configured.
      this.logger.warn(`Password reset token (dev only): ${token}`);

      await this.writeAuditLog(user.id, 'PASSWORD_RESET_REQUESTED', 'User', user.id);
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = MIN_RESPONSE_MS - elapsed;
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: resetToken.userId },
      select: { passwordHistory: true },
    });

    await this.assertNotRecentPassword(newPassword, user.passwordHistory);

    const newHash = await this.hashPassword(newPassword);
    const passwordHistory = [newHash, ...user.passwordHistory].slice(0, PASSWORD_HISTORY_LIMIT);

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newHash, passwordHistory, passwordChangedAt: new Date() },
      select: { id: true },
    });

    // Mark used rather than delete - keeps a record for the audit trail.
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // A password reset invalidates any other outstanding tokens for this
    // user, so an older, still-unused token (e.g. from an earlier request
    // the user abandoned) can't later be used to reset the password again.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
      data: { usedAt: new Date() },
    });

    await this.writeAuditLog(resetToken.userId, 'PASSWORD_RESET_COMPLETED', 'User', resetToken.userId);
  }

  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, process.env.MFA_ISSUER ?? 'RestaurantSecure', secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Secret is intentionally not persisted here - it's only saved once the
    // user proves possession of it via verifyAndEnableMfa(), so an
    // abandoned setup flow never leaves a usable-but-unconfirmed secret
    // sitting on the account.
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async verifyAndEnableMfa(userId: string, token: string, secret: string): Promise<void> {
    const valid = authenticator.verify({ token, secret });
    if (!valid) {
      throw new BadRequestException('Invalid MFA token');
    }

    const mfaSecretEnc = this.encryptSecret(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecretEnc },
      select: { id: true },
    });

    await this.writeAuditLog(userId, 'MFA_ENABLED', 'User', userId);
  }

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaSecretEnc: true } });
    if (!user?.mfaSecretEnc) {
      await this.writeAuditLog(userId, 'MFA_FAILED', 'User', userId);
      return false;
    }

    const secret = this.decryptSecret(user.mfaSecretEnc);
    const valid = authenticator.verify({ token, secret });

    await this.writeAuditLog(userId, valid ? 'MFA_VERIFIED' : 'MFA_FAILED', 'User', userId);

    return valid;
  }

  // CAPTCHA is a secondary brute-force defence layered behind rate
  // limiting - it targets scripted credential-stuffing/account-creation
  // tools that rotate IPs to dodge the throttler (OWASP Automated Threats
  // to Web Applications: OAT-019 Account Creation, OAT-007 Credential
  // Cracking). Bypassed in development (no secret key configured) so
  // local testing isn't blocked by a real hCaptcha challenge; in
  // production both CAPTCHA_SITE_KEY (frontend widget) and
  // CAPTCHA_SECRET_KEY (this server-side check) must be set together.
  async verifyCaptcha(token: string): Promise<boolean> {
    const secret = process.env.CAPTCHA_SECRET_KEY;
    if (!secret) {
      return true;
    }

    try {
      const response = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
      });

      const result = (await response.json()) as { success: boolean };
      return result.success;
    } catch (err: unknown) {
      this.logger.error(`CAPTCHA verification request failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // Argon2id chosen per OWASP Password Storage Cheat Sheet (2024): it is
  // memory-hard (resists GPU/ASIC cracking farms) and the "id" variant
  // combines resistance to both side-channel timing attacks (like
  // argon2i) and GPU cracking (like argon2d). Parameters below meet or
  // exceed OWASP's minimum recommended values and are tunable per
  // environment via env vars without a code change.
  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
    });
  }

  private async assertNotRecentPassword(newPassword: string, history: string[]): Promise<void> {
    for (const previousHash of history) {
      const matches = await argon2.verify(previousHash, newPassword).catch(() => false);
      if (matches) {
        throw new BadRequestException(
          `New password must not match any of your last ${PASSWORD_HISTORY_LIMIT} passwords`,
        );
      }
    }
  }

  private async handleFailedLogin(userId: string, ipAddress: string): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    await this.writeAuditLog(userId, 'LOGIN_FAILED', 'User', userId, {
      attempts: user.failedLoginAttempts,
      ip: ipAddress,
    });

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);

      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil },
        select: { id: true },
      });

      await this.writeAuditLog(userId, 'ACCOUNT_LOCKED', 'User', userId, { ip: ipAddress });

      this.logger.warn(`Account ${userId} locked until ${lockedUntil.toISOString()} after repeated failed logins`);

      // Record this lockout against the IP - credential stuffing rotates
      // accounts precisely to stay under any single account's lockout
      // threshold, so this is tracked per-IP independently of the
      // per-account counter above.
      await this.ipBlockService.recordLockoutFromIp(ipAddress);
    }
  }

  private async writeAuditLog(
    actorId: string | null,
    action: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          resourceId,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to write audit log for action "${action}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // AES-256-CBC with a key derived from SESSION_SECRET via scrypt.
  // Key management note: in this coursework deployment the encryption key
  // is derived from the same secret used to sign sessions, which is
  // acceptable for a single-instance demo but not for production - a real
  // deployment should use a dedicated key from a managed secret store
  // (e.g. AWS KMS/Vault) so that rotating the session secret doesn't also
  // invalidate every stored MFA secret.
  private encryptSecret(plaintext: string): string {
    const key = crypto.scryptSync(process.env.SESSION_SECRET as string, 'mfa-secret-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptSecret(encrypted: string): string {
    const [ivHex, dataHex] = encrypted.split(':');
    const key = crypto.scryptSync(process.env.SESSION_SECRET as string, 'mfa-secret-salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
