import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { AppDb } from '../../database/db.types';
import { StorageService } from './storage.service';

jest.mock('cloudinary', () => ({
  v2: { config: jest.fn(), uploader: { destroy: jest.fn() } },
}));

describe('StorageService shared club media protection', () => {
  const publicId = 'tournahub/communities/shared_image';
  const url = `https://res.cloudinary.com/example/image/upload/v123/${publicId}.jpg`;
  const where = jest.fn();
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where })) })),
    } as unknown as AppDb;
    service = new StorageService(new ConfigService({}), db);
  });

  it.each(['logoUrl', 'bannerUrl'])('retains an asset referenced by %s', async (field) => {
    where.mockResolvedValue([{ [field]: url }]);
    await expect(service.deleteFile(publicId)).resolves.toMatchObject({ result: 'skipped' });
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('allows deletion when no club references the asset', async () => {
    where.mockResolvedValue([]);
    (cloudinary.uploader.destroy as jest.Mock).mockImplementation(
      (_id: string, callback: (error: null, result: { result: string }) => void) =>
        callback(null, { result: 'ok' }),
    );
    await expect(service.deleteFile(publicId)).resolves.toEqual({ result: 'ok' });
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(publicId, expect.any(Function));
  });

  it('does not destroy anything when reference lookup fails', async () => {
    where.mockRejectedValue(new Error('database unavailable'));
    await expect(service.deleteFile(publicId)).rejects.toThrow('database unavailable');
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });
});
