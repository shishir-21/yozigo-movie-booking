import { describe, expect, it } from 'vitest';
import { formatHoldCountdown, getHoldCountdownMessage, getHoldCountdownUrgency } from './hold-countdown';

describe('seat hold countdown', () => {
  it('formats minute and second boundaries', () => {
    expect(formatHoldCountdown(300)).toBe('5:00');
    expect(formatHoldCountdown(61)).toBe('1:01');
    expect(formatHoldCountdown(9)).toBe('0:09');
    expect(formatHoldCountdown(0)).toBe('0:00');
  });

  it('clamps negative and invalid durations to zero', () => {
    expect(formatHoldCountdown(-2)).toBe('0:00');
    expect(formatHoldCountdown(Number.NaN)).toBe('0:00');
    expect(formatHoldCountdown(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('uses stable urgency buckets at the one-minute and 30-second thresholds', () => {
    expect(getHoldCountdownUrgency(61)).toBe('normal');
    expect(getHoldCountdownUrgency(60)).toBe('warning');
    expect(getHoldCountdownUrgency(31)).toBe('warning');
    expect(getHoldCountdownUrgency(30)).toBe('urgent');
    expect(getHoldCountdownUrgency(1)).toBe('urgent');
    expect(getHoldCountdownUrgency(0)).toBe('expired');
  });

  it('keeps announcements stable within a bucket rather than embedding each tick', () => {
    expect(getHoldCountdownMessage(getHoldCountdownUrgency(55))).toBe('Your seat hold expires in one minute.');
    expect(getHoldCountdownMessage(getHoldCountdownUrgency(44))).toBe('Your seat hold expires in one minute.');
    expect(getHoldCountdownMessage(getHoldCountdownUrgency(20))).toContain('30 seconds');
  });
});
