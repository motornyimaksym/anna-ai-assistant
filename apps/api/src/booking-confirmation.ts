import type { BookingConfirmationFacts } from '@booking/contracts';

function tokens(value: string): string[] {
  return value.normalize('NFKC').toLocaleLowerCase('uk-UA').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function containsPhrase(text: string[], phrase: string): boolean {
  const expected = tokens(phrase);
  if (!expected.length || expected.length > text.length) return false;
  for (let start = 0; start <= text.length - expected.length; start++) {
    if (expected.every((token, offset) => text[start + offset] === token)) return true;
  }
  return false;
}

function localDatePhrases(localDate: string): string[] {
  const months: Record<string, string> = {
    січ: 'січня', лют: 'лютого', бер: 'березня', кві: 'квітня', трав: 'травня', черв: 'червня',
    лип: 'липня', серп: 'серпня', вер: 'вересня', жовт: 'жовтня', лист: 'листопада', груд: 'грудня',
  };
  const parts = tokens(localDate).filter((part) => part !== 'р' && part !== 'року');
  const monthIndex = parts.findIndex((part) => Object.hasOwn(months, part));
  if (monthIndex < 0) return [localDate];
  const expanded = [...parts];
  expanded[monthIndex] = months[expanded[monthIndex]!]!;
  return [parts.join(' '), expanded.join(' ')];
}

function readableText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const foreignCurrencies = [
  { code: 'USD', terms: ['usd', 'dollar', 'dollars', 'долар', 'долари', 'доларів'], symbols: ['$'] },
  { code: 'EUR', terms: ['eur', 'euro', 'євро'], symbols: ['€'] },
  { code: 'GBP', terms: ['gbp', 'pound', 'pounds', 'фунт', 'фунти', 'фунтів'], symbols: ['£'] },
  { code: 'PLN', terms: ['pln', 'zloty', 'злотий', 'злотих'], symbols: ['zł'] },
  { code: 'RUB', terms: ['rub', 'ruble', 'рубль', 'рублі', 'рублів'], symbols: ['₽'] },
];

/** Required booking facts may move within natural wording, but may not be changed or omitted. */
export function containsBookingConfirmationFacts(message: string, facts: BookingConfirmationFacts): boolean {
  const readable = readableText(message);
  const text = tokens(readable);
  const duration = facts.durationMinutes;
  const durationPhrases = [
    `${duration} хв`, `${duration} хвилина`, `${duration} хвилини`, `${duration} хвилин`,
    `${duration} min`, `${duration} mins`, `${duration} minute`, `${duration} minutes`,
  ];
  const allNumbers = (value: string) => value.normalize('NFKC').match(/\d+/gu) ?? [];
  const expectedNumbers = new Map<string, number>();
  for (const number of allNumbers(`${facts.serviceName} ${duration} ${facts.localDate} ${facts.localTime} ${facts.price} ${facts.referenceCode}`)) expectedNumbers.set(number, (expectedNumbers.get(number) ?? 0) + 1);
  const usedNumbers = new Map<string, number>();
  for (const number of allNumbers(readable)) usedNumbers.set(number, (usedNumbers.get(number) ?? 0) + 1);
  const hasNoConflictingNumbers = [...usedNumbers].every(([number, count]) => count <= (expectedNumbers.get(number) ?? 0));
  const hasNoConflictingCurrency = foreignCurrencies.every(({ code, terms, symbols }) => code === facts.currency.toUpperCase()
    || (!terms.some((term) => text.includes(term)) && !symbols.some((symbol) => readable.includes(symbol))));
  return hasNoConflictingNumbers
    && hasNoConflictingCurrency
    && containsPhrase(text, facts.serviceName)
    && localDatePhrases(facts.localDate).some((phrase) => containsPhrase(text, phrase))
    && containsPhrase(text, facts.localTime)
    && durationPhrases.some((phrase) => containsPhrase(text, phrase))
    && containsPhrase(text, `${facts.price} ${facts.currency}`)
    && containsPhrase(text, facts.referenceCode);
}
