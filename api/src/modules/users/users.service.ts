import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: string;
  mfaEnabled: boolean;
  createdAt: Date;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => this.toSafeUser(user));
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toSafeUser(user);
  }

  async create(dto: CreateUserDto, actorId: string): Promise<SafeUser> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // Role is always looked up by name, never a hardcoded ID - keeps this
    // correct across environments/reseeds and matches the pattern in
    // AuthService.register().
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) {
      throw new NotFoundException(`Role "${dto.roleName}" is not configured`);
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
      include: { role: true },
    });

    await this.auditLog.write(actorId, 'USER_CREATED', 'User', user.id, { roleName: dto.roleName });

    return this.toSafeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<SafeUser> {
    if (id === actorId) {
      throw new ForbiddenException('Cannot modify your own account through this endpoint');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    let roleId: string | undefined;
    if (dto.roleName) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
      if (!role) {
        throw new NotFoundException(`Role "${dto.roleName}" is not configured`);
      }
      roleId = role.id;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        roleId,
        isActive: dto.isActive,
      },
      include: { role: true },
    });

    // Metadata records which fields changed - never the password, which
    // this endpoint doesn't even accept.
    await this.auditLog.write(actorId, 'USER_UPDATED', 'User', id, {
      fullName: dto.fullName !== undefined,
      roleName: dto.roleName,
      isActive: dto.isActive,
    });

    return this.toSafeUser(user);
  }

  async deactivate(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Hard deletion is avoided because audit log entries reference user
    // IDs via a foreign key - deleting the row would either fail the FK
    // constraint or silently orphan/null out historical audit evidence.
    // Deactivation preserves the audit trail while preventing login (the
    // isActive check happens in AuthService.login()).
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });

    await this.auditLog.write(actorId, 'USER_DEACTIVATED', 'User', id);
  }

  async unlockAccount(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await this.auditLog.write(actorId, 'ACCOUNT_UNLOCKED', 'User', id);
  }

  // Argon2id, same params as AuthService.hashPassword() - see that
  // method for the OWASP rationale.
  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
    });
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    role: { name: string };
    mfaEnabled: boolean;
    createdAt: Date;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      role: user.role.name,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
    };
  }
}
