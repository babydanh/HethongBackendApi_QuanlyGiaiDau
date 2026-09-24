import { BadRequestException } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';

describe('TournamentFeePolicyService', () => {
  const repositoryMock = {
    getFeesConfig: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const policy = new TournamentFeePolicyService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not query platform fee settings for free entries', async () => {
    await expect(policy.assertEntryFeeAllowed(0)).resolves.toBeUndefined();
    expect(repositoryMock.getFeesConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid money values and disabled paid entry', async () => {
    await expect(policy.assertEntryFeeAllowed(10.5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repositoryMock.getFeesConfig).not.toHaveBeenCalled();

    repositoryMock.getFeesConfig.mockResolvedValue({ allowEntryFees: false });
    await expect(policy.assertEntryFeeAllowed(100)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('distinguishes omitted, enabled, and explicitly disabled division fees', () => {
    expect(policy.resolveDivisionEntryFeeMutation({})).toEqual({
      hasMutation: false,
      enabled: false,
      fee: null,
    });
    expect(
      policy.resolveDivisionEntryFeeMutation({ entryFee: 500 }),
    ).toEqual({ hasMutation: true, enabled: true, fee: 500 });
    expect(
      policy.resolveDivisionEntryFeeMutation({ entryFeeOverrideEnabled: false }),
    ).toEqual({ hasMutation: true, enabled: false, fee: null });
  });
});
