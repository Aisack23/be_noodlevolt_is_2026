import { Injectable } from '@nestjs/common';
import type { IngredientAvailabilityChecker } from '../ports/index.js';

@Injectable()
export class AlwaysSufficientIngredientChecker implements IngredientAvailabilityChecker {
  // TODO(E5) BE-5.1.1: reemplazar este provider por la verificación de recetas e inventario por lote.
  findSufficientDishIds(
    _branchId: string,
    dishIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(dishIds));
  }
}
