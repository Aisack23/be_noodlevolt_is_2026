export class InvalidBranchTimeZoneError extends Error {
  constructor(timeZone: string) {
    super(`La zona horaria de la sucursal no es válida: ${timeZone}.`);
  }
}
