import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@PrismaClient';
import { SalesReportService } from './sales-report.service.js';

describe('HU-10: ventas por fechas', () => {
  const branch = {
    id: 'branch-a',
    name: 'Sucursal A',
    address: 'Calle principal',
    timeZone: 'America/El_Salvador',
  };

  it('HU-10-AC1: pagos aprobados en el intervalo suman el total de mi sucursal', async () => {
    const repository = {
      aggregateApproved: vi.fn().mockResolvedValue({
        total: new Prisma.Decimal('125.50'),
        paymentsCount: 2,
      }),
    };
    const branchRepository = {
      findById: vi.fn().mockResolvedValue(branch),
      findAll: vi.fn(),
    };
    const service = new SalesReportService(
      repository as never,
      branchRepository as never,
    );

    const result = await service.getSales(
      { role: 'BRANCH_ADMIN', branchId: branch.id },
      { from: '2026-01-15', to: '2026-01-16' },
    );

    expect(result).toMatchObject({
      branchId: branch.id,
      total: '125.50',
      paymentsCount: 2,
    });
    expect(repository.aggregateApproved).toHaveBeenCalledWith({
      branchId: branch.id,
      start: new Date('2026-01-15T06:00:00.000Z'),
      end: new Date('2026-01-17T06:00:00.000Z'),
    });
  });

  it('HU-10-AC2: pagos rechazados y pedidos cancelados no se incluyen en el total', async () => {
    const repository = {
      aggregateApproved: vi.fn().mockResolvedValue({
        total: new Prisma.Decimal('40.00'),
        paymentsCount: 1,
      }),
    };
    const service = new SalesReportService(
      repository as never,
      { findById: vi.fn().mockResolvedValue(branch), findAll: vi.fn() } as never,
    );

    const result = await service.getSales(
      { role: 'BRANCH_ADMIN', branchId: branch.id },
      { from: '2026-01-15', to: '2026-01-15' },
    );

    expect(result.total).toBe('40.00');
    expect(result.paymentsCount).toBe(1);
  });

  it('HU-10-AC3: fecha de inicio posterior a la de fin rechaza con 400', async () => {
    const service = new SalesReportService(
      { aggregateApproved: vi.fn() } as never,
      { findById: vi.fn(), findAll: vi.fn() } as never,
    );

    await expect(service.getSales(
      { role: 'BRANCH_ADMIN', branchId: branch.id },
      { from: '2026-01-16', to: '2026-01-15' },
    )).rejects.toMatchObject({ status: 400 });
  });
});

