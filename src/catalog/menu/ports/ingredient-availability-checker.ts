export const INGREDIENT_AVAILABILITY_CHECKER = Symbol(
  'IngredientAvailabilityChecker',
);

export interface IngredientAvailabilityChecker {
  /** Cada platillo se evalúa para una porción, de forma independiente del resto del menú. */
  findSufficientDishIds(
    branchId: string,
    dishIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
