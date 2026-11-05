import { PrismaClient } from '../../src/generated/prisma/client.js';
import { BASE_BRANCHES } from './base-data.js';

export async function seedBranchConfigData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    for (const { name } of BASE_BRANCHES) {
      const branch = await tx.branch.findUniqueOrThrow({ where: { name } });
      await tx.branchConfig.upsert({
        where: { branchId: branch.id },
        update: {},
        create: { branchId: branch.id },
      });
    }
  });
}
