import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { createMediaSchema, updateMediaSchema, mediaSchema, mediaIdSchema, MEDIA_PHOTO_MAX_BYTES, MEDIA_VIDEO_MAX_BYTES, type MediaDto, type MediaFileInput } from '@booking/contracts';
import { FirebaseAdminService } from './firebase-admin.js';

type StoredMedia = MediaDto & { storagePath: string };
type SendStatus = 'sent' | 'cooldown' | 'busy' | 'unavailable' | 'failed' | 'uncertain';
const LEASE_MS = 60_000;

export function decodeMedia(file: MediaFileInput): { buffer: Buffer; extension: string; kind: 'photo' | 'video' } {
  if (file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new BadRequestException('Invalid base64 file');
  const buffer = Buffer.from(file.base64, 'base64');
  if (buffer.toString('base64') !== file.base64) throw new BadRequestException('Invalid base64 file');
  const video = file.contentType === 'video/mp4';
  if (!buffer.length || buffer.length > (video ? MEDIA_VIDEO_MAX_BYTES : MEDIA_PHOTO_MAX_BYTES)) throw new BadRequestException(video ? 'Video must be at most 20 MB' : 'Photo must be at most 5 MB');
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const mp4 = buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp' && buffer.readUInt32BE(0) >= 16 && buffer.readUInt32BE(0) <= buffer.length && /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(buffer.toString('ascii', 8, 12));
  if (!(video ? mp4 : file.contentType === 'image/jpeg' ? jpeg : png)) throw new BadRequestException('File content does not match its type');
  return { buffer, extension: video ? 'mp4' : file.contentType === 'image/jpeg' ? 'jpg' : 'png', kind: video ? 'video' : 'photo' };
}

@Injectable()
export class MediaStoreService {
  private readonly db = getFirestore();
  private readonly logger = new Logger(MediaStoreService.name);
  constructor(_firebase: FirebaseAdminService) {}
  private ref(id: string) { return this.db.collection('media').doc(mediaIdSchema.parse(id)); }
  async list(): Promise<MediaDto[]> {
    const snapshot = await this.db.collection('media').get();
    return snapshot.docs.map((doc) => mediaSchema.parse({ ...doc.data(), id: doc.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async upload(id: string, file: MediaFileInput) {
    const { buffer, extension, kind } = decodeMedia(file);
    const storagePath = `media/${id}/${randomUUID()}.${extension}`;
    const object = getStorage().bucket().file(storagePath);
    try {
      await object.save(buffer, { resumable: false, metadata: { contentType: file.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
      return { kind, storagePath, url: await getDownloadURL(object), sizeBytes: buffer.length, filename: file.filename, contentType: file.contentType };
    } catch (error) { await this.cleanup(storagePath); throw error; }
  }
  private async cleanup(path: string) {
    if (!path.startsWith('media/')) return;
    try { await getStorage().bucket().file(path).delete({ ignoreNotFound: true }); }
    catch { this.logger.warn('Media object cleanup failed'); }
  }
  async create(body: unknown): Promise<MediaDto> {
    const { file, ...metadata } = createMediaSchema.parse(body);
    const ref = this.db.collection('media').doc();
    const asset = await this.upload(ref.id, file);
    const now = new Date().toISOString();
    const item = { ...metadata, ...asset, id: ref.id, createdAt: now, updatedAt: now };
    try { await ref.create(item); } catch (error) { await this.cleanup(asset.storagePath); throw error; }
    return mediaSchema.parse(item);
  }
  async update(id: string, body: unknown): Promise<MediaDto> {
    const { file, ...metadata } = updateMediaSchema.parse(body);
    const ref = this.ref(id);
    if (!(await ref.get()).exists) throw new NotFoundException('Media not found');
    const asset = file ? await this.upload(id, file) : undefined;
    let result: StoredMedia;
    let oldPath: string | undefined;
    try {
      const saved = await this.db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists) throw new NotFoundException('Media not found');
        const previous = current.data() as StoredMedia;
        const next = { ...previous, ...metadata, ...asset, updatedAt: new Date().toISOString() };
        tx.set(ref, next);
        return { next, oldPath: previous.storagePath };
      });
      result = saved.next; oldPath = saved.oldPath;
    } catch (error) { if (asset) await this.cleanup(asset.storagePath); throw error; }
    if (asset && oldPath) await this.cleanup(oldPath);
    return mediaSchema.parse(result);
  }
  async delete(id: string): Promise<{ ok: true }> {
    const ref = this.ref(id);
    const path = await this.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) throw new NotFoundException('Media not found');
      tx.delete(ref);
      return (current.data() as StoredMedia).storagePath;
    });
    await this.cleanup(path);
    return { ok: true };
  }
  private deliveryRef(chatId: string, mediaId: string) { return this.db.collection('conversations').doc(chatId).collection('mediaDeliveries').doc(mediaId); }
  async available(chatId: string) {
    const items = (await this.list()).filter((item) => item.enabled);
    if (!items.length) return [];
    const states = await this.db.getAll(...items.map((item) => this.deliveryRef(chatId, item.id)));
    const now = Date.now();
    return items.map((item, index) => {
      const state = states[index]?.data();
      const nextEligibleAt = typeof state?.lastSentAt === 'number' ? state.lastSentAt + item.debounceSeconds * 1000 : 0;
      return { id: item.id, description: item.description, kind: item.kind, debounceSeconds: item.debounceSeconds, eligible: nextEligibleAt <= now && !(state?.leaseUntil > now), ...(nextEligibleAt > now ? { nextEligibleAt: new Date(nextEligibleAt).toISOString() } : {}) };
    });
  }
  async send(id: string, chatId: string, businessConnectionId?: string): Promise<{ status: SendStatus }> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { status: 'failed' };
    const ref = this.ref(id); const stateRef = this.deliveryRef(chatId, id); const leaseId = randomUUID();
    const claim = await this.db.runTransaction(async (tx) => {
      const [snapshot, stateSnapshot] = await tx.getAll(ref, stateRef);
      if (!snapshot?.exists || !snapshot.data()?.enabled) return { status: 'unavailable' as const };
      const item = mediaSchema.parse({ ...snapshot.data(), id });
      const state = stateSnapshot?.data(); const now = Date.now();
      if (state?.leaseUntil > now) return { status: 'busy' as const };
      if (typeof state?.lastSentAt === 'number' && state.lastSentAt + item.debounceSeconds * 1000 > now) return { status: 'cooldown' as const };
      tx.set(stateRef, { ...(typeof state?.lastSentAt === 'number' ? { lastSentAt: state.lastSentAt } : {}), leaseId, leaseUntil: now + LEASE_MS });
      return { item };
    });
    if ('status' in claim) return { status: claim.status! };
    const item = claim.item;
    let status: SendStatus = 'uncertain';
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${item.kind === 'photo' ? 'sendPhoto' : 'sendVideo'}`, {
        method: 'POST', signal: AbortSignal.timeout(25_000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}), [item.kind === 'photo' ? 'photo' : 'video']: item.url }),
      });
      const result = await response.json() as { ok?: boolean; result?: { message_id?: number } };
      if (response.ok && result.ok === true && typeof result.result?.message_id === 'number') status = 'sent';
      else if (result.ok === false) status = 'failed';
    } catch { this.logger.warn('Media delivery outcome uncertain'); }
    try {
      await this.db.runTransaction(async (tx) => {
        const state = (await tx.get(stateRef)).data();
        if (state?.leaseId !== leaseId) return;
        tx.set(stateRef, status === 'sent' || status === 'uncertain' ? { lastSentAt: Date.now() } : typeof state.lastSentAt === 'number' ? { lastSentAt: state.lastSentAt } : {});
      });
    } catch { this.logger.warn('Media delivery state update failed'); return { status: 'uncertain' }; }
    return { status };
  }
}
