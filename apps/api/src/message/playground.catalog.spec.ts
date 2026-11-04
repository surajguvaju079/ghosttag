import { todayCatalog, dailyTopics, pulseChoices } from './playground.catalog';

describe('curated playground catalog', () => {
  it('uses the same UTC date and topic across time zones', () => {
    const before = todayCatalog(new Date('2026-11-03T00:00:00Z'));
    const later = todayCatalog(new Date('2026-11-03T23:59:59Z'));
    expect(before.date).toBe('2026-11-03');
    expect(before.topic).toBe(later.topic);
    expect(todayCatalog(new Date('2026-11-04T00:00:00Z')).date).toBe(
      '2026-11-04',
    );
    expect(dailyTopics).toHaveLength(14);
    expect(new Set(pulseChoices.map((choice) => choice.id)).size).toBe(
      pulseChoices.length,
    );
  });
});
