import { describe, expect, it } from 'vitest';
import { serviceSchema, telegramCaptionSchema, telegramUrlButtonSchema } from './index.js';

const service = { id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };

describe('service Telegram presentation contract', () => {
  it('accepts caption entity offsets measured in UTF-16 code units', () => {
    expect(telegramCaptionSchema.safeParse({ text: 'Warm🙂', entities: [{ type: 'bold', offset: 4, length: 2 }] }).success).toBe(true);
  });

  it('rejects invalid entity ranges and links without destinations', () => {
    expect(telegramCaptionSchema.safeParse({ text: 'Hi', entities: [{ type: 'italic', offset: 1, length: 2 }] }).success).toBe(false);
    expect(telegramCaptionSchema.safeParse({ text: 'Link', entities: [{ type: 'text_link', offset: 0, length: 4 }] }).success).toBe(false);
    expect(telegramCaptionSchema.safeParse({ text: 'crossing', entities: [{ type: 'bold', offset: 0, length: 5 }, { type: 'italic', offset: 3, length: 5 }] }).success).toBe(false);
    expect(telegramCaptionSchema.safeParse({ text: 'unsafe', entities: [{ type: 'text_link', offset: 0, length: 6, url: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('keeps image captions within Telegram limit and validates URL buttons', () => {
    expect(serviceSchema.safeParse({ ...service, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/photo.jpg?token=x', telegramCaption: { text: 'x'.repeat(1025), entities: [] } }).success).toBe(false);
    expect(telegramUrlButtonSchema.safeParse({ text: 'Book', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(telegramUrlButtonSchema.safeParse({ text: 'Instagram', url: 'https://instagram.com/anna' }).success).toBe(true);
  });
});
