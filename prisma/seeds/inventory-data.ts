import { PrismaClient } from '../../src/generated/prisma/client.js';

const CENTRO = 'NoodleVolt Centro';
const SANTA_TECLA = 'NoodleVolt Santa Tecla';

// Cada sucursal cubre los casos por debajo, igual y por encima del mínimo, con
// valores distintos entre sucursales para que el aislamiento se pueda comprobar.
const INVENTORY = [
  {
    name: 'Fideos de ramen',
    unit: 'kg',
    stock: {
      [CENTRO]: { currentStock: '3', minimumStock: '5' },
      [SANTA_TECLA]: { currentStock: '12', minimumStock: '5' },
    },
  },
  {
    name: 'Pechuga de pollo',
    unit: 'kg',
    stock: {
      [CENTRO]: { currentStock: '4', minimumStock: '4' },
      [SANTA_TECLA]: { currentStock: '2.5', minimumStock: '4' },
    },
  },
  {
    name: 'Caldo base',
    unit: 'L',
    stock: {
      [CENTRO]: { currentStock: '20', minimumStock: '8' },
      [SANTA_TECLA]: { currentStock: '8', minimumStock: '8' },
    },
  },
  {
    name: 'Salsa de soya',
    unit: 'L',
    stock: {
      [CENTRO]: { currentStock: '0', minimumStock: '2' },
      [SANTA_TECLA]: { currentStock: '6', minimumStock: '2' },
    },
  },
];

export async function seedInventoryData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const branchIds = new Map<string, string>();
    for (const name of [CENTRO, SANTA_TECLA]) {
      const branch = await tx.branch.findUniqueOrThrow({ where: { name } });
      branchIds.set(name, branch.id);
    }
    for (const { name, unit, stock } of INVENTORY) {
      const ingredient = await tx.ingredient.upsert({
        where: { name },
        update: {},
        create: { name, unit },
      });
      // Solo inserta lo que falta: repetir el seed no debe tocar existencias ni
      // updated_at de filas que ya existen.
      await tx.branchIngredient.createMany({
        data: Object.entries(stock).map(([branchName, quantities]) => {
          const branchId = branchIds.get(branchName);
          if (!branchId)
            throw new Error(`Sucursal del seed inexistente: ${branchName}`);
          return { branchId, ingredientId: ingredient.id, ...quantities };
        }),
        skipDuplicates: true,
      });
    }
  });
}
