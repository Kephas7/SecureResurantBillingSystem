import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;

const PERMISSIONS: { key: string; description: string }[] = [
  { key: 'users:create', description: 'Create user accounts' },
  { key: 'users:read', description: 'View user accounts' },
  { key: 'users:update', description: 'Update user accounts' },
  { key: 'users:delete', description: 'Delete/deactivate user accounts' },
  { key: 'orders:create', description: 'Create new orders' },
  { key: 'orders:read', description: 'View orders' },
  { key: 'orders:update', description: 'Update order status/contents' },
  { key: 'orders:cancel', description: 'Cancel an order' },
  { key: 'invoices:create', description: 'Create invoices' },
  { key: 'invoices:read', description: 'View invoices' },
  { key: 'invoices:refund', description: 'Approve invoice refunds' },
  { key: 'inventory:read', description: 'View inventory/stock levels' },
  { key: 'inventory:update', description: 'Update inventory/stock levels' },
  { key: 'reports:read', description: 'View reports' },
  { key: 'logs:read', description: 'View audit logs' },
  { key: 'kitchen:read', description: 'View kitchen order queue' },
  { key: 'kitchen:update', description: 'Update kitchen order status' },
];

const ROLE_PERMISSIONS: Record<(typeof ROLES)[number], string[]> = {
  ADMIN: ['users:create', 'users:read', 'users:update', 'users:delete', 'logs:read'],
  MANAGER: [
    'orders:read',
    'orders:cancel',
    'invoices:read',
    'invoices:refund',
    'inventory:read',
    'inventory:update',
    'reports:read',
  ],
  CASHIER: ['orders:read', 'invoices:create', 'invoices:read'],
  WAITER: ['orders:create', 'orders:read', 'orders:update', 'orders:cancel'],
  KITCHEN: ['kitchen:read', 'kitchen:update'],
};

const ADMIN_EMAIL = 'admin@restaurant.local';
const ADMIN_PASSWORD = 'Admin@Secure123!';

async function main(): Promise<void> {
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const roleName of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });

    for (const permissionKey of ROLE_PERMISSIONS[roleName]) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existingAdmin) {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });

    // Same Argon2id params as AuthService.hashPassword() - see that method
    // for the OWASP rationale.
    const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
    });

    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        passwordHistory: [passwordHash],
        fullName: 'System Administrator',
        roleId: adminRole.id,
      },
    });

    // eslint-disable-next-line no-console
    console.warn(
      `\nSeeded admin account:\n  email:    ${ADMIN_EMAIL}\n  password: ${ADMIN_PASSWORD}\n` +
        '  WARNING: change this password immediately after first login.\n',
    );
  }
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
