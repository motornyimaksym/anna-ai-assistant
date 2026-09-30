import type { BookingConfirmationFacts } from '@booking/contracts';

export type BookingConfirmationMismatch = 'service' | 'duration' | 'date' | 'time' | 'price' | 'currency' | 'reference_code' | 'conflicting_number' | 'conflicting_currency';

function tokens(value: string): string[] {
  return normalizeNumberGroups(value).toLocaleLowerCase('uk-UA').match(/[\p{L}\p{N}]+/gu)?.map(normalizeNumericToken) ?? [];
}

function normalizeNumberGroups(value: string): string {
  return value.normalize('NFKC').replace(/(?<=\d)[\s\u00a0\u202f,.'’](?=\d{3}(?:\D|$))/gu, '');
}

function normalizeNumericToken(value: string): string {
  return /^\d+$/u.test(value) ? value.replace(/^0+(?=\d)/u, '') : value;
}

function moneyTokens(value: string): string[] {
  return normalizeNumberGroups(value).toLocaleLowerCase('uk-UA').match(/[\p{L}\p{N}]+|₴/gu)?.map(normalizeNumericToken) ?? [];
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
  const yearIndex = parts.findIndex((part) => /^\d{4}$/u.test(part));
  const withoutYear = parts.filter((_part, index) => index !== yearIndex);
  const expandedWithoutYear = expanded.filter((_part, index) => index !== yearIndex);
  return [parts.join(' '), expanded.join(' '), withoutYear.join(' '), expandedWithoutYear.join(' ')];
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

function containsPriceAndCurrency(message: string, price: number, currency: string): boolean {
  const text = moneyTokens(message.replace(/<[^>]*>/g, ''));
  const amount = moneyTokens(String(price));
  const aliases = currency.toUpperCase() === 'UAH' ? ['uah', 'грн', 'гривня', 'гривні', 'гривень', '₴'] : [currency];
  const hasSequence = (sequence: string[], start: number) => sequence.length > 0 && sequence.every((token, offset) => text[start + offset] === token);
  return aliases.some((alias) => {
    const currencyTokens = moneyTokens(alias);
    if (!currencyTokens.length) return false;
    for (let start = 0; start <= text.length - amount.length - currencyTokens.length; start++) {
      if ((hasSequence(amount, start) && hasSequence(currencyTokens, start + amount.length))
        || (hasSequence(currencyTokens, start) && hasSequence(amount, start + currencyTokens.length))) return true;
    }
    return false;
  });
}

function containsAmount(message: string, price: number): boolean {
  const text = moneyTokens(message.replace(/<[^>]*>/g, ''));
  const amount = moneyTokens(String(price));
  return amount.length > 0 && text.some((_token, start) => amount.every((token, offset) => text[start + offset] === token));
}

function containsCurrency(message: string, currency: string): boolean {
  const text = moneyTokens(message.replace(/<[^>]*>/g, ''));
  const aliases = currency.toUpperCase() === 'UAH' ? ['uah', 'грн', 'гривня', 'гривні', 'гривень', '₴'] : [currency];
  return aliases.some((alias) => {
    const phrase = moneyTokens(alias);
    return phrase.length > 0 && text.some((_token, start) => phrase.every((token, offset) => text[start + offset] === token));
  });
}

/** Required booking facts may move within natural wording, but may not be changed or omitted. */
export function bookingConfirmationMismatches(message: string, facts: BookingConfirmationFacts): BookingConfirmationMismatch[] {
  const readable = readableText(message);
  const text = tokens(readable);
  const duration = facts.durationMinutes;
  const durationPhrases = [
    `${duration} хв`, `${duration} хвилина`, `${duration} хвилини`, `${duration} хвилин`,
    `${duration} min`, `${duration} mins`, `${duration} minute`, `${duration} minutes`,
  ];
  const allNumbers = (value: string) => normalizeNumberGroups(value).match(/\d+/gu)?.map(normalizeNumericToken) ?? [];
  const expectedNumbers = new Map<string, number>();
  for (const number of allNumbers(`${facts.serviceName} ${duration} ${facts.localDate} ${facts.localTime} ${facts.price}${facts.referenceCode ? ` ${facts.referenceCode}` : ''}`)) expectedNumbers.set(number, (expectedNumbers.get(number) ?? 0) + 1);
  const usedNumbers = new Map<string, number>();
  for (const number of allNumbers(readable)) usedNumbers.set(number, (usedNumbers.get(number) ?? 0) + 1);
  const hasNoConflictingNumbers = [...usedNumbers].every(([number, count]) => count <= (expectedNumbers.get(number) ?? 0));
  const hasNoConflictingCurrency = foreignCurrencies.every(({ code, terms, symbols }) => code === facts.currency.toUpperCase()
    || (!terms.some((term) => text.includes(term)) && !symbols.some((symbol) => readable.includes(symbol))));
  const mismatches: BookingConfirmationMismatch[] = [];
  if (!containsPhrase(text, facts.serviceName)) mismatches.push('service');
  if (!durationPhrases.some((phrase) => containsPhrase(text, phrase))) mismatches.push('duration');
  if (!localDatePhrases(facts.localDate).some((phrase) => containsPhrase(text, phrase))) mismatches.push('date');
  if (!containsPhrase(text, facts.localTime)) mismatches.push('time');
  const hasPrice = containsAmount(readable, facts.price);
  const hasCurrency = containsCurrency(readable, facts.currency);
  if (!hasPrice) mismatches.push('price');
  if (!hasCurrency || (hasPrice && !containsPriceAndCurrency(readable, facts.price, facts.currency))) mismatches.push('currency');
  if (facts.referenceCode && !containsPhrase(text, facts.referenceCode)) mismatches.push('reference_code');
  if (!hasNoConflictingNumbers) mismatches.push('conflicting_number');
  if (!hasNoConflictingCurrency) mismatches.push('conflicting_currency');
  return mismatches;
}

export function containsBookingConfirmationFacts(message: string, facts: BookingConfirmationFacts): boolean {
  return bookingConfirmationMismatches(message, facts).length === 0;
}
