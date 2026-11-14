export class RewardError extends Error {
  constructor(
    public readonly kind: 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'RewardError';
  }
}
