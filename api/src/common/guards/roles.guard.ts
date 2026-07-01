import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * The user's role is ALWAYS re-fetched from the database here, never read
 * from the session or trusted from the request body. This prevents
 * privilege escalation via session tampering: even if an attacker forges
 * or modifies their session cookie to claim `role: "ADMIN"`, this guard
 * only ever trusts the roleId currently stored against their user row.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;

    if (!userId) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    if (!requiredRoles.includes(user.role.name)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
