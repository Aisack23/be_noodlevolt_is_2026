export class BranchNotFoundError extends Error {
  constructor(public readonly branchId: string) {
    super('La sucursal no existe.');
    this.name = 'BranchNotFoundError';
  }
}
