import { describe, expect, it } from 'vitest';
import { csvCell, daysUntil, label, money } from './format';

describe('format helpers', () => {
  it('formats money in the event currency', () => { expect(money(150000, 'INR')).toContain('1,50,000'); expect(money(1000, 'USD')).toContain('1,000'); });
  it('labels categories', () => expect(label('av_equipment')).toBe('Av equipment'));
  it('counts days until a date', () => expect(daysUntil('2026-10-30', new Date(2026, 9, 23))).toBe(7));
  it('escapes CSV cells', () => expect(csvCell('a "b", c')).toBe('"a ""b"", c"'));
});
