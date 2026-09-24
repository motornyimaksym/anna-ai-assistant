import { describe, expect, it } from 'vitest';
import { decodeServicePhoto } from '../src/service-photo.service.js';

describe('service photo validation', () => {
  it('accepts supported JPEG, PNG, and WebP image signatures', () => {
    expect(decodeServicePhoto('image/jpeg', '/9j/')).toMatchObject({ extension: 'jpg' });
    expect(decodeServicePhoto('image/png', 'iVBORw0KGgo=')).toMatchObject({ extension: 'png' });
    expect(decodeServicePhoto('image/webp', Buffer.from('RIFFxxxxWEBP').toString('base64'))).toMatchObject({ extension: 'webp' });
  });

  it('rejects mismatched MIME signatures and empty files', () => {
    expect(() => decodeServicePhoto('image/png', '/9j/')).toThrow('Image content does not match its file type');
    expect(() => decodeServicePhoto('image/jpeg', '')).toThrow('Image file is empty');
  });
});
