import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Not stored on the session - the whole point of RolesGuard is that role
// is never trusted from session/client state. This is a per-request-only
// cache of the DB lookup this guard already had to do, so downstream
// handlers (e.g. OrdersService's role-segregated queries) don't need a
// second identical query just to find out the role RolesGuard already
// fetched a moment ago.
declare module 'express' {
  interface Request {
    resolvedRole?: string;
  }
}

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

    request.resolvedRole = user.role.name;

    return true;
  }
}
