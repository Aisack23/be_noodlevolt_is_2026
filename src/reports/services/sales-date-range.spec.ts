import { describe, expect, it } from 'vitest';
import {
  InvalidBranchTimeZoneError,
  InvalidSalesDateRangeError,
} from '../errors/index.js';
import { parseSalesDateRange, toUtcSalesDateRange } from './sales-date-range.js';

describe('sales date range', () => {
  it('convierte un día de El Salvador a un intervalo UTC semiabierto', () => {
    const range = parseSalesDateRange('2026-01-15', '2026-01-15');
    const utcRange = toUtcSalesDateRange(range, 'America/El_Salvador');

    expect(utcRange.start.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    expect(utcRange.end.toISOString()).toBe('2026-01-16T06:00:00.000Z');
  });

  it('respeta un día de 23 horas al cambiar horario de verano', () => {
    const range = parseSalesDateRange('2026-03-08', '2026-03-08');
    const utcRange = toUtcSalesDateRange(range, 'America/New_York');

    expect(utcRange.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(utcRange.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it.each([
    ['2026-01-15', '2026-01-14'],
    ['2026-01-15T00:00:00', '2026-01-15'],
    ['2025-01-01', '2026-01-03'],
  ])('rechaza el rango inválido %s a %s', (from, to) => {
    expect(() => parseSalesDateRange(from, to)).toThrow(
      InvalidSalesDateRangeError,
    );
  });

  it('acepta exactamente 366 días inclusivos', () => {
    const range = parseSalesDateRange('2024-01-01', '2024-12-31');

    expect(range.endDateExclusive).toEqual({ year: 2025, month: 1, day: 1 });
  });

  it('rechaza zonas horarias inválidas', () => {
    const range = parseSalesDateRange('2026-01-15', '2026-01-15');

    expect(() => toUtcSalesDateRange(range, 'America/NoExiste')).toThrow(
      InvalidBranchTimeZoneError,
    );
  });
});
