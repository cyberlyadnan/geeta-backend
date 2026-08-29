import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daysBetween, evaluateReprintWindow } from '../reprint-window.js';

const at = (iso: string): Date => new Date(iso);

describe('reprint window', () => {
  it('counts whole days only — 23 hours after dispatch is still day zero', () => {
    assert.equal(daysBetween(at('2026-08-01T09:00:00Z'), at('2026-08-02T08:00:00Z')), 0);
    assert.equal(daysBetween(at('2026-08-01T09:00:00Z'), at('2026-08-02T10:00:00Z')), 1);
  });

  it('is open on the day of dispatch', () => {
    const result = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-01T18:00:00Z'),
      windowDays: 15,
      requiresDispatch: true,
    });
    assert.equal(result.expired, false);
    assert.equal(result.daysSinceDispatch, 0);
    assert.equal(result.daysRemaining, 15);
  });

  it('is still open on the last day of the window', () => {
    const result = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-16T09:00:00Z'),
      windowDays: 15,
      requiresDispatch: true,
    });
    assert.equal(result.daysSinceDispatch, 15);
    assert.equal(result.expired, false);
    assert.equal(result.daysRemaining, 0);
  });

  it('closes the day after the window', () => {
    const result = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-17T09:00:00Z'),
      windowDays: 15,
      requiresDispatch: true,
    });
    assert.equal(result.daysSinceDispatch, 16);
    assert.equal(result.expired, true);
    assert.equal(result.daysRemaining, -1);
  });

  it('reports the exact last date a request can be raised', () => {
    const result = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-05T09:00:00Z'),
      windowDays: 15,
      requiresDispatch: true,
    });
    assert.equal(result.lastDateToRaise.slice(0, 10), '2026-08-16');
  });

  it('honours a window the admin has changed', () => {
    const sevenDays = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-09T09:00:00Z'),
      windowDays: 7,
      requiresDispatch: true,
    });
    assert.equal(sevenDays.expired, true);

    const thirtyDays = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-09T09:00:00Z'),
      windowDays: 30,
      requiresDispatch: true,
    });
    assert.equal(thirtyDays.expired, false);
    assert.equal(thirtyDays.daysRemaining, 22);
  });

  it('a zero-day window closes the day after dispatch, not on it', () => {
    const sameDay = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-01T20:00:00Z'),
      windowDays: 0,
      requiresDispatch: true,
    });
    assert.equal(sameDay.expired, false);

    const nextDay = evaluateReprintWindow({
      reference: at('2026-08-01T09:00:00Z'),
      now: at('2026-08-02T20:00:00Z'),
      windowDays: 0,
      requiresDispatch: true,
    });
    assert.equal(nextDay.expired, true);
  });
});
