import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

type OrderLine = { dishId: string; quantity: number };

@Injectable()
export class IngredientAvailabilityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findSufficientDishIds(branchId: string, dishIds: readonly string[]) {
    const recipes = await this.requirements(this.prisma, branchId, dishIds);
    const unavailable = new Set(
      recipes.filter((row) => row.stock === null || row.stock.lt(row.quantity)).map((row) => row.dishId),
    );
    return new Set(dishIds.filter((dishId) => !unavailable.has(dishId)));
  }

  async unavailableDish(tx: Prisma.TransactionClient, branchId: string, lines: readonly OrderLine[]) {
    const quantities = new Map<string, number>();
    for (const { dishId, quantity } of lines)
      quantities.set(dishId, (quantities.get(dishId) ?? 0) + quantity);

    const recipes = await this.requirements(tx, branchId, [...quantities.keys()]);
    const required = new Map<string, Prisma.Decimal>();
    for (const row of recipes) {
      const total = (required.get(row.ingredientId) ?? new Prisma.Decimal(0))
        .add(row.quantity.mul(quantities.get(row.dishId)!));
      required.set(row.ingredientId, total);
      if (row.stock === null || row.stock.lt(total)) return row.dishId;
    }
    return null;
  }

  private requirements(
    client: Prisma.TransactionClient,
    branchId: string,
    dishIds: readonly string[],
  ) {
    if (!dishIds.length) return Promise.resolve([]);
    const ids = dishIds.map((id) => Prisma.sql`${id}::uuid`);
    return client.$queryRaw<{
      dishId: string; ingredientId: string; quantity: Prisma.Decimal; stock: Prisma.Decimal | null;
    }[]>(Prisma.sql`
      SELECT r.dish_id AS "dishId", r.ingredient_id AS "ingredientId", r.quantity,
             bi.current_stock AS stock
      FROM recipes r
      JOIN dishes d ON d.id = r.dish_id AND d.branch_id = ${branchId}::uuid
      JOIN ingredients i ON i.id = r.ingredient_id
      LEFT JOIN branch_ingredients bi ON bi.ingredient_id = r.ingredient_id
        AND bi.branch_id = d.branch_id AND bi.is_active AND i.is_active
      WHERE r.dish_id IN (${Prisma.join(ids)})
      ORDER BY r.dish_id, r.ingredient_id
    `);
  }
}
