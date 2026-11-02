export interface MenuPrice {
  toFixed(decimalPlaces: number): string;
}

export interface MenuDish {
  id: string;
  name: string;
  description: string | null;
  price: MenuPrice;
  status: 'AVAILABLE' | 'SOLD_OUT' | 'DISABLED';
  category: { id: string; name: string; displayOrder: number };
}

export interface BranchMenu {
  branch: { id: string; name: string };
  dishes: readonly MenuDish[];
}

export interface AvailableMenuDish extends MenuDish {
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  dishes: AvailableMenuDish[];
}

export interface PublicMenu {
  branch: BranchMenu['branch'];
  categories: MenuCategory[];
}
