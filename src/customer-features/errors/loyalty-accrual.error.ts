export class LoyaltyAccrualError extends Error {
  constructor(options?: ErrorOptions) {
    super('No se pudieron acreditar los puntos del pago.', options);
    this.name = 'LoyaltyAccrualError';
  }
}
