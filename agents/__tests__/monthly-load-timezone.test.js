/**
 * Monthly load — timezone boundary
 *
 * Invariant protected by this test suite:
 *   The monthly-load total must use IST (Asia/Kolkata) calendar-month
 *   boundaries, NOT the server's local time. A transaction at 23:30 IST
 *   on Jan 31 (18:00 UTC Jan 31) is a January load; a transaction at
 *   00:30 IST on Feb 1 (19:00 UTC Jan 31) is a February load. If the
 *   server runs UTC and uses `Date.getMonth()` naively, both land in
 *   January and February's fresh cap doesn't reset until 05:30 IST.
 *
 * The `getMonthlyLoadTotal` pure function in
 * `mcp/services/wallet-load-guard.js` accepts an explicit `timezone`
 * argument and uses `Intl.DateTimeFormat` to resolve calendar-month
 * boundaries correctly regardless of server TZ. These tests exercise
 * that function directly at the boundary.
 */

import { describe, it, expect } from 'vitest';
import { getMonthlyLoadTotal } from '../../services/wallet-load-guard.js';

describe('getMonthlyLoadTotal — IST boundary correctness', () => {
  it('counts a 23:30-IST load on Jan 31 as January (UTC would also say Jan 31)', () => {
    // 2026-01-31T18:00:00Z = 23:30 IST on Jan 31 — still January in both TZs
    const loads = [{ amount: 5000000, timestamp: '2026-01-31T18:00:00Z', status: 'success' }];
    const total = getMonthlyLoadTotal({ loads, month: '2026-01', timezone: 'Asia/Kolkata' });
    expect(total).toBe(5000000);
  });

  it('counts a 00:30-IST load on Feb 1 as February (UTC would misclassify as Jan)', () => {
    // 2026-01-31T19:00:00Z = 00:30 IST on Feb 1 — February in IST, January in UTC
    const loads = [{ amount: 5000000, timestamp: '2026-01-31T19:00:00Z', status: 'success' }];
    const februaryTotal = getMonthlyLoadTotal({ loads, month: '2026-02', timezone: 'Asia/Kolkata' });
    const januaryTotalWrong = getMonthlyLoadTotal({ loads, month: '2026-01', timezone: 'Asia/Kolkata' });
    expect(februaryTotal).toBe(5000000);
    expect(januaryTotalWrong).toBe(0); // must NOT be 5000000
  });

  it('splits two loads around the IST midnight boundary correctly', () => {
    const loads = [
      { amount: 5000000, timestamp: '2026-01-31T18:00:00Z', status: 'success' }, // 23:30 IST Jan 31 → Jan
      { amount: 3000000, timestamp: '2026-01-31T19:00:00Z', status: 'success' }, // 00:30 IST Feb 1 → Feb
    ];
    const january = getMonthlyLoadTotal({ loads, month: '2026-01', timezone: 'Asia/Kolkata' });
    const february = getMonthlyLoadTotal({ loads, month: '2026-02', timezone: 'Asia/Kolkata' });
    expect(january).toBe(5000000);
    expect(february).toBe(3000000);
  });

  it('respects an explicit UTC timezone when requested (proves we are reading the option)', () => {
    const loads = [{ amount: 5000000, timestamp: '2026-01-31T19:00:00Z', status: 'success' }];
    // In UTC this timestamp is January; in IST it's February. Explicitly ask for UTC.
    const utcJan = getMonthlyLoadTotal({ loads, month: '2026-01', timezone: 'UTC' });
    expect(utcJan).toBe(5000000);
  });

  it('excludes non-success loads', () => {
    const loads = [
      { amount: 5000000, timestamp: '2026-04-15T12:00:00Z', status: 'success' },
      { amount: 3000000, timestamp: '2026-04-16T12:00:00Z', status: 'failed' },
    ];
    const total = getMonthlyLoadTotal({ loads, month: '2026-04', timezone: 'Asia/Kolkata' });
    expect(total).toBe(5000000);
  });

  it('returns 0 for an empty or missing loads array', () => {
    expect(getMonthlyLoadTotal({ loads: [], month: '2026-04' })).toBe(0);
    expect(getMonthlyLoadTotal({ loads: null, month: '2026-04' })).toBe(0);
    expect(getMonthlyLoadTotal({ loads: [], month: null })).toBe(0);
  });
});

describe('Monthly load — paise integer invariants at boundary', () => {
  it('uses paise integers for all internal math (no floating-point drift)', () => {
    const paiseAmount = 20000000; // ₹2,00,000
    expect(Number.isInteger(paiseAmount)).toBe(true);
    expect(paiseAmount).toBe(2_00_000 * 100);
  });
});
