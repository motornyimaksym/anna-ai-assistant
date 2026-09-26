import { describe, expect, it } from 'vitest';
import { findScheduleDialog } from '../src/telegram-schedule-source.js';

const dialog = (id: string, title: string, kind: 'group' | 'channel' | 'user' = 'group') => ({
  id: { toString: () => id }, title, isGroup: kind === 'group', isChannel: kind === 'channel', inputEntity: { id },
});

describe('schedule source chat matching', () => {
  it('binds by stored peer ID after first match, even when title changes', () => {
    const renamed = dialog('42', 'Studio planning');
    expect(findScheduleDialog([renamed], '42')).toBe(renamed);
  });

  it('matches key title words without requiring exact title or conjunctions', () => {
    const target = dialog('42', 'Календар і планування часу - студія');
    expect(findScheduleDialog([dialog('3', 'Загальний чат'), target])).toBe(target);
  });

  it('skips weak or ambiguous matches and personal chats', () => {
    expect(findScheduleDialog([dialog('7', 'Календар', 'user')])).toBeUndefined();
    expect(findScheduleDialog([dialog('7', 'Календар планування'), dialog('8', 'Планування часу')])).toBeUndefined();
    expect(findScheduleDialog([dialog('7', 'Календар студії'), dialog('8', 'Планування студії')])).toBeUndefined();
  });
});


it('uses a bound private chat and never falls back to a different named group', () => {
  const privateChat = { id: '99', title: 'Personal calendar' };
  expect(findScheduleDialog([privateChat], '99')).toBe(privateChat);
  expect(findScheduleDialog([{ id: '42', title: 'Календар та планування часу', isGroup: true }], '99')).toBeUndefined();
});
