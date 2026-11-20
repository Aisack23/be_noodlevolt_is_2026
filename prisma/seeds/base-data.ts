import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '../../src/generated/prisma/client.js';

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
  // En producción el seed solo corre si el operador lo pide explícitamente.
  // La comparación es estricta, igual que readBoolean en env.validation.ts.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_SEED !== 'true'
  )
    throw new Error(
      'Los datos y usuarios demo no se pueden crear en producción sin ALLOW_DEMO_SEED=true.',
    );
  const password = process.env.DEMO_SEED_PASSWORD;
  if (
    !password ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    password.length < 12
  )
    throw new Error(
      'Proporciona DEMO_SEED_PASSWORD de 12 caracteres como mínimo y 72 bytes como máximo para crear datos demo.',
    );
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const branches = new Map<string, string>();
    for (const data of BASE_BRANCHES) {
      const branch = await tx.branch.upsert({
        where: { name: data.name },
        update: {},
        create: data,
      });
      branches.set(branch.name, branch.id);
      const room = await tx.diningRoom.upsert({
        where: {
          branchId_name: { branchId: branch.id, name: 'Salón principal' },
        },
        update: {},
        create: { branchId: branch.id, name: 'Salón principal' },
      });
      for (let number = 1; number <= 6; number++) {
        const table = await tx.diningTable.upsert({
          where: {
            branchId_number: { branchId: branch.id, number: String(number) },
          },
          update: {},
          create: {
            branchId: branch.id,
            roomId: room.id,
            number: String(number),
            capacity: 4,
          },
        });
        if (table.roomId === null)
          await tx.diningTable.update({
            where: { id: table.id },
            data: { roomId: room.id },
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
