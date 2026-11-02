import { Injectable } from '@nestjs/common';
import type { IngredientAvailabilityChecker } from '../ports/index.js';

@Injectable()
export class AlwaysSufficientIngredientChecker implements IngredientAvailabilityChecker {
  // TODO(E5) BE-5.1.1: InventoryModule debe registrar y exportar
  // InventoryAvailabilityChecker (implementa IngredientAvailabilityChecker).
  // CatalogModule debe importar InventoryModule y enlazar el token
  // INGREDIENT_AVAILABILITY_CHECKER con useExisting: InventoryAvailabilityChecker.
  findSufficientDishIds(
    _branchId: string,
    dishIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(dishIds));
  }
}
