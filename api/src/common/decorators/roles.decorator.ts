import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given role names. Enforced by RolesGuard, which
 * re-fetches the caller's role from the database - the role listed here is
 * only ever compared against that trusted DB value, never against the
 * session or request body.
 *
 * @example
 * ```ts
 * @Roles('ADMIN')
 * @Post('register')
 * register(@Body() dto: RegisterDto) { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
