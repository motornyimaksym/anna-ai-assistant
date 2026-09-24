import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/controllers.js';
import type { AvailabilityService } from '../src/availability.service.js';
import type { BookingService } from '../src/booking.service.js';
import type { BookingRepository } from '../src/repository.js';
import type { ServicePhotoService } from '../src/service-photo.service.js';
import type { SpecService } from '../src/spec.service.js';

const sample = { id: 'massage', name: 'Massage', description: 'Relaxing massage', durationMinutes: 60, bufferMinutes: 15, price: 1500, currency: 'UAH', enabled: true };
const setup = () => {
  const oldPhoto = 'https://firebasestorage.googleapis.com/v0/b/demo/o/service-photos%2Fold.jpg?alt=media&token=old';
  const repository = {
    getService: vi.fn(async () => ({ ...sample, photoUrl: oldPhoto })),
    saveService: vi.fn(async (service: typeof sample & { photoUrl?: string }) => service),
  };
  const photos = {
    upload: vi.fn(async () => 'https://firebasestorage.googleapis.com/v0/b/demo/o/service-photos%2Fnew.jpg?alt=media&token=new'),
    delete: vi.fn(async () => undefined),
  };
  const controller = new AdminController(repository as unknown as BookingRepository, {} as BookingService, {} as AvailabilityService, {} as SpecService, photos as unknown as ServicePhotoService);
  return { controller, repository, photos, oldPhoto };
};

describe('admin service endpoints', () => {
  it('uploads a protected service photo and replaces the previous photo', async () => {
    const { controller, repository, photos, oldPhoto } = setup();
    const result = await controller.uploadServicePhoto('massage', { contentType: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(photos.upload).toHaveBeenCalledWith('massage', { contentType: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(repository.saveService).toHaveBeenCalledWith({ ...sample, photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/service-photos%2Fnew.jpg?alt=media&token=new' });
    expect(photos.delete).toHaveBeenCalledWith(oldPhoto);
    expect(result).toEqual({ photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/service-photos%2Fnew.jpg?alt=media&token=new' });
  });

  it('deletes the stored photo when a service is saved without one', async () => {
    const { controller, photos, oldPhoto } = setup();
    await controller.patchService('massage', sample);
    expect(photos.delete).toHaveBeenCalledWith(oldPhoto);
  });
});
