import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '../../src/generated/prisma/client.js';

export const DEMO_PASSWORD = 'Demo1234!';
export const BASE_BRANCHES = [
  { name: 'NoodleVolt Centro', address: 'San Salvador, Centro' },
  { name: 'NoodleVolt Santa Tecla', address: 'La Libertad, Santa Tecla' },
];

const USERS = [
  { role: UserRole.CLIENT, email: 'demo@example.com', branch: null },
  {
    role: UserRole.WAITER,
    email: 'waiter@example.com',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.COOK,
    email: 'cook@example.com',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.CASHIER,
    email: 'cashier@example.com',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.INVENTORY_MANAGER,
    email: 'inventory_manager@example.com',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.BRANCH_ADMIN,
    email: 'branch_admin@example.com',
    name: 'Gerente Santa Tecla',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.BRANCH_ADMIN,
    email: 'branch_admin_centro@example.com',
    name: 'Gerente Centro',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.GENERAL_MANAGER,
    email: 'general_manager@example.com',
    branch: null,
  },
];

export async function seedBaseData(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await prisma.$transaction(async (tx) => {
    const branches = new Map<string, string>();
    for (const data of BASE_BRANCHES) {
      const branch = await tx.branch.upsert({
        where: { name: data.name },
        update: {},
        create: data,
      });
      branches.set(branch.name, branch.id);
      for (let number = 1; number <= 6; number++) {
        await tx.diningTable.upsert({
          where: {
            branchId_number: { branchId: branch.id, number: String(number) },
          },
          update: {},
          create: { branchId: branch.id, number: String(number), capacity: 4 },
        });
      }
    }
    for (const user of USERS) {
      const branchId = user.branch === null ? null : branches.get(user.branch);
      if (branchId === undefined)
        throw new Error(`Sucursal del seed inexistente: ${user.branch}`);
      await tx.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          email: user.email,
          name: user.name ?? user.role,
          lastName: 'Demo',
          passwordHash,
          role: user.role,
          branchId,
        },
      });
    }
  });
}
