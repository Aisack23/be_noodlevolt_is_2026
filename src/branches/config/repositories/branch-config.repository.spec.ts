import { Test } from '@nestjs/testing';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';
import { BranchConfigRepository } from './branch-config.repository.js';

// Misma forma que @prisma/adapter-pg entrega en una violación real de FK.
function foreignKeyViolation(
  constraint: string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('FK', {
    code: 'P2003',
    clientVersion: 'test',
    meta: {
      modelName: 'BranchConfig',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind: 'ForeignKeyConstraintViolation',
          constraint: { index: constraint },
        },
      },
    },
  });
}

describe('BranchConfigRepository', () => {
  const upsert = vi.fn<() => Promise<unknown>>();
  const tx = {
    branch: { findFirst: vi.fn(() => Promise.resolve({ id: 'branch' })) },
    branchConfig: { upsert },
  };
  const prisma = {
    $transaction: <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
  };
  let repository: BranchConfigRepository;

  beforeEach(async () => {
    upsert.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        BranchConfigRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repository = module.get(BranchConfigRepository);
  });

  it('traduce la FK de sucursal a BranchNotFoundError', async () => {
    upsert.mockRejectedValue(
      foreignKeyViolation('branch_configs_branch_id_fkey'),
    );
    await expect(
      repository.setIsOpen('branch', false, 'user'),
    ).rejects.toBeInstanceOf(BranchNotFoundError);
  });

  it('no traduce la FK de updated_by: sale como error del servidor', async () => {
    const violation = foreignKeyViolation('branch_configs_updated_by_fkey');
    upsert.mockRejectedValue(violation);
    await expect(repository.setIsOpen('branch', false, 'user')).rejects.toBe(
      violation,
    );
  });

  it('no traduce un P2003 que no identifica la restricción', async () => {
    const violation = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: 'test',
    });
    upsert.mockRejectedValue(violation);
    await expect(repository.setIsOpen('branch', false, 'user')).rejects.toBe(
      violation,
    );
  });
});
