import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MenuResponseDto } from '../dto/index.js';
import { BranchNotFoundError } from '../errors/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../ports/index.js';
import type { IngredientAvailabilityChecker } from '../ports/index.js';
import { MenuRepository } from '../repositories/index.js';
import type { BranchMenu, MenuCategory } from '../types/index.js';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @Inject(MenuRepository) private readonly repository: MenuRepository,
    @Inject(INGREDIENT_AVAILABILITY_CHECKER)
    private readonly ingredients: IngredientAvailabilityChecker,
  ) {}

  async getMenu(branchId: string): Promise<MenuResponseDto> {
    let menu: BranchMenu;
    try {
      menu = await this.repository.findByBranchId(branchId);
    } catch (error) {
      if (error instanceof BranchNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }

    let sufficient: ReadonlySet<string>;
    try {
      sufficient = await this.ingredients.findSufficientDishIds(
        branchId,
        menu.dishes.map((dish) => dish.id),
      );
    } catch (error) {
      this.logger.warn(
        'No se pudo verificar la disponibilidad de insumos.',
        error,
      );
      sufficient = new Set<string>();
    }
    const categories = new Map<string, MenuCategory>();
    for (const dish of menu.dishes) {
      let category = categories.get(dish.category.id);
      if (!category) {
        category = { ...dish.category, dishes: [] };
        categories.set(category.id, category);
      }
      category.dishes.push({
        ...dish,
        available: dish.status === 'AVAILABLE' && sufficient.has(dish.id),
      });
    }
    const orderedCategories = [...categories.values()].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || compareNames(left, right),
    );
    for (const category of orderedCategories)
      category.dishes.sort(compareNames);
    return MenuResponseDto.fromMenu({
      branch: menu.branch,
      categories: orderedCategories,
    });
  }
}

function compareNames(
  left: { id: string; name: string },
  right: { id: string; name: string },
): number {
  return (
    left.name.localeCompare(right.name, 'es') || left.id.localeCompare(right.id)
  );
}
