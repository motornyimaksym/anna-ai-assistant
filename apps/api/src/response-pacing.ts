export const responseDelayMs = (text: string): number => Array.from(text).length * 600;

export const waitForResponsePacing = async (text: string): Promise<void> => {
  const delay = responseDelayMs(text);
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
};
