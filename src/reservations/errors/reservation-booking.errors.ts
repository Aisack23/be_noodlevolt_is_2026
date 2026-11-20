export class ReservationBranchUnavailableError extends Error {
  constructor() {
    super('La sucursal no existe o está inactiva.');
    this.name = 'ReservationBranchUnavailableError';
  }
}

export class ReservationDateInPastError extends Error {
  constructor() {
    super('La reservación debe ser para una fecha futura.');
    this.name = 'ReservationDateInPastError';
  }
}

export class ReservationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReservationUnavailableError';
  }
}
