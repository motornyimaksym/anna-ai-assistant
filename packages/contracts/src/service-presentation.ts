type ServiceCaptionSource = { name: string; description: string; durationMinutes: number; price: number; currency: string };

const truncateUtf16 = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  let end = Math.max(0, maxLength - 1);
  const lastCodeUnit = text.charCodeAt(end - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end--;
  return `${text.slice(0, end).trimEnd()}…`;
};

export const defaultServiceCaption = (service: ServiceCaptionSource, withPhoto: boolean): string => {
  const prefix = service.name;
  const description = service.description.trim();
  const footer = `${service.durationMinutes} хв · ${service.price} ${service.currency}`;
  if (!withPhoto) return [prefix, description, footer].filter(Boolean).join('\n\n');
  const heading = `${prefix}\n\n`;
  const ending = `\n\n${footer}`;
  const availableDescription = Math.max(0, 1024 - heading.length - ending.length);
  return `${heading}${truncateUtf16(description, availableDescription)}${ending}`;
};
