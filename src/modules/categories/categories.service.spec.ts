import { CategoriesService } from './categories.service';

describe('CategoriesService admin category visibility', () => {
  it('loads inactive categories only through the admin query', async () => {
    const repository = {
      findAllCategories: jest.fn().mockResolvedValue([
        { id: 'active', isActive: true },
        { id: 'inactive', isActive: false },
      ]),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(repository as never, redis as never);

    await service.findAllAdminCategories({});

    expect(repository.findAllCategories).toHaveBeenCalledWith({ includeInactive: true });
  });
});
