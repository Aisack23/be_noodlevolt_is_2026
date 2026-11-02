export interface MenuPrice {
  toFixed(decimalPlaces: number): string;
}

export interface MenuDish {
  id: string;
  name: string;
  description: string | null;
  price: MenuPrice;
  status: 'AVAILABLE' | 'SOLD_OUT' | 'DISABLED';
  category: { id: string; name: string };
}

export interface BranchMenu {
  branch: { id: string; name: string };
  dishes: readonly MenuDish[];
}
