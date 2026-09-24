import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import type { z } from 'zod';
import { servicePhotoUploadSchema } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
type Upload = z.infer<typeof servicePhotoUploadSchema>;

export const decodeServicePhoto = (contentType: Upload['contentType'], base64: string): { buffer: Buffer; extension: 'jpg' | 'png' | 'webp' } => {
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new BadRequestException('Image file is empty');
  if (buffer.length > MAX_PHOTO_BYTES) throw new BadRequestException('Image exceeds the 5 MiB limit');
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  const match = contentType === 'image/jpeg' ? isJpeg : contentType === 'image/png' ? isPng : isWebp;
  if (!match) throw new BadRequestException('Image content does not match its file type');
  return { buffer, extension: contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp' };
};

@Injectable()
export class ServicePhotoService {
  private readonly logger = new Logger(ServicePhotoService.name);
  constructor(_firebase: FirebaseAdminService) {}

  async upload(serviceId: string, input: Upload): Promise<string> {
    const { buffer, extension } = decodeServicePhoto(input.contentType, input.base64);
    const bucket = getStorage().bucket();
    const path = `service-photos/${encodeURIComponent(serviceId)}/${randomUUID()}.${extension}`;
    const file = bucket.file(path);
    await file.save(buffer, {
      resumable: false,
      metadata: { contentType: input.contentType, cacheControl: 'public, max-age=31536000, immutable' },
    });
    return getDownloadURL(file);
  }

  async delete(photoUrl: string): Promise<void> {
    try {
      const bucket = getStorage().bucket();
      const parsed = new URL(photoUrl);
      const objectPrefix = `/v0/b/${bucket.name}/o/`;
      if (parsed.hostname !== 'firebasestorage.googleapis.com' || !parsed.pathname.startsWith(objectPrefix)) return;
      const path = decodeURIComponent(parsed.pathname.slice(objectPrefix.length));
      if (!path.startsWith('service-photos/')) return;
      await bucket.file(path).delete({ ignoreNotFound: true });
    } catch {
      this.logger.warn('Service photo cleanup failed');
    }
  }
}
