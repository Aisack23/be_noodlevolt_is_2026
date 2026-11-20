import {
  InvalidBranchTimeZoneError,
  InvalidSalesDateRangeError,
} from '../errors/index.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAXIMUM_RANGE_DAYS = 366;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_ZONE_SEARCH_WINDOW_MS = 36 * 60 * 60 * 1000;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface SalesDateRange {
  from: string;
  to: string;
  startDate: CalendarDate;
  endDateExclusive: CalendarDate;
}

export interface UtcSalesDateRange {
  start: Date;
  end: Date;
}

export function parseSalesDateRange(from: string, to: string): SalesDateRange {
  const startDate = parseCalendarDate(from, 'from');
  const endDate = parseCalendarDate(to, 'to');
  const days =
    (calendarDateToEpoch(endDate) - calendarDateToEpoch(startDate)) /
      MILLISECONDS_PER_DAY +
    1;

  if (days < 1)
    throw new InvalidSalesDateRangeError(
      'La fecha from no puede ser posterior a to.',
    );
  if (days > MAXIMUM_RANGE_DAYS)
    throw new InvalidSalesDateRangeError(
      'El rango máximo permitido es de 366 días.',
    );

  return {
    from,
    to,
    startDate,
    endDateExclusive: addCalendarDays(endDate, 1),
  };
}

export function toUtcSalesDateRange(
  range: SalesDateRange,
  timeZone: string,
): UtcSalesDateRange {
  const formatter = createDateFormatter(timeZone);
  return {
    start: firstInstantOfLocalDate(range.startDate, formatter),
    end: firstInstantOfLocalDate(range.endDateExclusive, formatter),
  };
}

function parseCalendarDate(value: string, field: 'from' | 'to'): CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (!match)
    throw new InvalidSalesDateRangeError(
      `El parámetro ${field} debe tener formato YYYY-MM-DD.`,
    );

  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const normalized = epochToCalendarDate(calendarDateToEpoch(date));
  if (!sameCalendarDate(date, normalized))
    throw new InvalidSalesDateRangeError(
      `El parámetro ${field} debe ser una fecha válida.`,
    );
  return date;
}

function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new InvalidBranchTimeZoneError(timeZone);
  }
}

function firstInstantOfLocalDate(
  targetDate: CalendarDate,
  formatter: Intl.DateTimeFormat,
): Date {
  const targetEpoch = calendarDateToEpoch(targetDate);
  let lowerBound = targetEpoch - TIME_ZONE_SEARCH_WINDOW_MS;
  let upperBound = targetEpoch + TIME_ZONE_SEARCH_WINDOW_MS;

  while (lowerBound < upperBound) {
    const middle = Math.floor((lowerBound + upperBound) / 2);
    const middleDate = getCalendarDate(new Date(middle), formatter);
    if (compareCalendarDates(middleDate, targetDate) < 0) {
      lowerBound = middle + 1;
    } else {
      upperBound = middle;
    }
  }

  const result = new Date(lowerBound);
  if (!sameCalendarDate(getCalendarDate(result, formatter), targetDate)) {
    throw new InvalidBranchTimeZoneError(formatter.resolvedOptions().timeZone);
  }
  return result;
}

function getCalendarDate(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): CalendarDate {
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return epochToCalendarDate(calendarDateToEpoch(date) + days * MILLISECONDS_PER_DAY);
}

function calendarDateToEpoch(date: CalendarDate): number {
  const value = new Date(0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime();
}

function epochToCalendarDate(epoch: number): CalendarDate {
  const date = new Date(epoch);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return calendarDateToEpoch(left) - calendarDateToEpoch(right);
}

function sameCalendarDate(left: CalendarDate, right: CalendarDate): boolean {
  return compareCalendarDates(left, right) === 0;
}
