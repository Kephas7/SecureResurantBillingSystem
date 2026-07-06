import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// Reads the role RolesGuard already resolved from the database for this
// request (see roles.guard.ts). Only ever populated on routes that carry
// an @Roles() decorator - which is every route that needs this value.
export const CurrentUserRole = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.resolvedRole ?? null;
});
