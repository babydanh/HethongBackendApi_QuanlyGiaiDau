import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { StorageService } from '../../../providers/storage/storage.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentMediaService } from './tournament-media.service';

describe('TournamentMediaService', () => {
  const repository = {
    findById: jest.fn(),
    update: jest.fn(),
  } as unknown as TournamentsRepository;
  const storage = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  } as unknown as StorageService;
  const access = {
    isManager: jest.fn(),
  } as unknown as TournamentAccessService;
  const media = new TournamentMediaService(repository, storage, access);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects gallery writes from a non-manager before persistence', async () => {
    repository.findById = jest.fn().mockResolvedValue({
      id: 'tournament-1',
      createdBy: 'organizer-1',
      tournamentType: 'PUBLIC',
      galleryImages: [],
    });
    access.isManager = jest.fn().mockResolvedValue(false);

    await expect(
      media.addGalleryImage('tournament-1', 'member-1', 'image-url'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('deletes a stored image before saving the gallery without that image', async () => {
    const events: string[] = [];
    const storedUrl =
      'https://res.cloudinary.com/example/image/upload/v123/tournahub/gallery/photo.jpg';
    repository.findById = jest.fn().mockResolvedValue({
      id: 'tournament-1',
      createdBy: 'organizer-1',
      tournamentType: 'PUBLIC',
      galleryImages: [storedUrl, 'external-image'],
      tournamentConfig: {},
    });
    access.isManager = jest.fn().mockResolvedValue(true);
    storage.deleteFile = jest.fn().mockImplementation(async () => {
      events.push('storage');
    });
    repository.update = jest.fn().mockImplementation(async (_id, _userId, data) => {
      events.push('database');
      return { id: 'tournament-1', ...data, tournamentConfig: {} };
    });

    const result = await media.removeGalleryImage(
      'tournament-1',
      'organizer-1',
      0,
    );

    expect(events).toEqual(['storage', 'database']);
    expect(repository.update).toHaveBeenCalledWith('tournament-1', 'organizer-1', {
      galleryImages: ['external-image'],
    });
    expect(result.galleryImages).toEqual(['external-image']);
  });

  it('checks the published file field before uploading the attachment', async () => {
    const tournament = {
      id: 'tournament-1',
      tournamentConfig: {
        registrationForm: {
          status: 'PUBLISHED',
          fields: [
            {
              id: 'proof',
              type: 'FILE',
              acceptedFileTypes: ['application/pdf'],
            },
          ],
        },
      },
    };
    repository.findById = jest.fn().mockResolvedValue(tournament);
    const file = {
      buffer: Buffer.from('proof'),
      originalname: 'proof.pdf',
      mimetype: 'application/pdf',
      size: 5,
    } as Express.Multer.File;
    const assertAccessible = jest.fn();
    storage.uploadFile = jest.fn().mockResolvedValue({
      secure_url: 'https://stored.example/proof.pdf',
      public_id: 'proof',
    });

    const result = await media.uploadRegistrationAttachment(
      'tournament-1',
      'member-1',
      'proof',
      file,
      assertAccessible,
    );

    expect(assertAccessible).toHaveBeenCalledWith(tournament);
    expect(storage.uploadFile).toHaveBeenCalledWith(
      file,
      'tournahub/registration-attachments',
    );
    expect(result).toMatchObject({
      url: 'https://stored.example/proof.pdf',
      publicId: 'proof',
      originalName: 'proof.pdf',
    });
  });

  it('rejects a file type outside the configured field allowlist', async () => {
    repository.findById = jest.fn().mockResolvedValue({
      id: 'tournament-1',
      tournamentConfig: {
        registrationForm: {
          status: 'PUBLISHED',
          fields: [
            {
              id: 'proof',
              type: 'FILE',
              acceptedFileTypes: ['application/pdf'],
            },
          ],
        },
      },
    });
    const file = {
      buffer: Buffer.from('image'),
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 5,
    } as Express.Multer.File;

    await expect(
      media.uploadRegistrationAttachment(
        'tournament-1',
        'member-1',
        'proof',
        file,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});
