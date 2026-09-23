export const stripApiPrefix = (url: string): string => url.replace(/^\/api(?=\/|\?|$)/, '') || '/';
