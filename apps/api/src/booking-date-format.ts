export const BOOKING_DATE_GUIDANCE = 'Write client-facing dates as DD month, weekday, HH:mm in Ukrainian, e.g. 29 вересня, вівторок, 19:00. Convert to the supplied local timezone; omit timezone labels.';

/** Format the local date and time explicitly, independent of the server timezone. */
export function formatBookingDate(value: string): string {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Kyiv',
    day: '2-digit', month: 'long', weekday: 'long',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return `${part('day')} ${part('month')}, ${part('weekday')}, ${part('hour')}:${part('minute')}`;
}
