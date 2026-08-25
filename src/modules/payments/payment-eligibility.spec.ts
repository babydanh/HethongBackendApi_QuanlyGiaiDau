import { PaymentsService } from './payments.service';
import { PaymentPurpose } from './dto/create-payment.dto';

const makeService = (participant: Record<string, unknown>) => {
  const repository = {
    findParticipantById: jest.fn().mockResolvedValue(participant),
    findCompletedParticipantPayment: jest.fn().mockResolvedValue(null),
    findDivisionById: jest.fn().mockResolvedValue(null),
    getConfigValue: jest.fn().mockResolvedValue('0'),
    countParticipantPlayers: jest.fn().mockResolvedValue(1),
  };
  const service = new PaymentsService(
    repository as never,
    { sendNotification: jest.fn() } as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    { reserveSlot: jest.fn(), releaseSlot: jest.fn() } as never,
  );
  return service as unknown as {
    calculatePayment: (
      userId: string,
      data: unknown,
      tournament: unknown,
    ) => Promise<unknown>;
  };
};

const tournament = {
  id: 'tournament-1',
  createdBy: 'organizer-1',
  name: 'Giải kiểm thử',
  entryFee: '100000',
  platformFeePercentage: '0',
  tournamentType: 'PUBLIC',
  isRanked: false,
};

const paymentData = {
  purpose: PaymentPurpose.REGISTRATION_FEE,
  participantId: 'participant-1',
  tournamentId: 'tournament-1',
};

describe('registration payment eligibility', () => {
  it('rejects PENDING_APPROVAL registrations before PayOS link creation', async () => {
    const service = makeService({
      id: 'participant-1',
      tournamentId: 'tournament-1',
      registeredBy: 'user-1',
      isPaid: false,
      teamStatus: 'PENDING_APPROVAL',
      tournamentDivisionId: null,
    });

    await expect(
      service.calculatePayment(
        'user-1',
        paymentData as never,
        tournament as never,
      ),
    ).rejects.toThrow('phải hoàn tất đủ thành viên');
  });

  it('uses the participant fee snapshot even when the current tournament fee is higher', async () => {
    const service = makeService({
      id: 'participant-1',
      tournamentId: 'tournament-1',
      registeredBy: 'user-1',
      isPaid: false,
      entryFeeAtRegistration: '100000.00',
      teamStatus: 'COMPLETE',
      tournamentDivisionId: null,
    });

    await expect(
      service.calculatePayment(
        'user-1',
        paymentData as never,
        {
          ...tournament,
          entryFee: '200000',
        } as never,
      ),
    ).resolves.toMatchObject({ amount: 100000 });
  });

  it('rejects a participant with a completed payment even when isPaid is stale false', async () => {
    const repository = {
      findParticipantById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        tournamentId: 'tournament-1',
        registeredBy: 'user-1',
        isPaid: false,
        entryFeeAtRegistration: '100000.00',
        teamStatus: 'COMPLETE',
        tournamentDivisionId: null,
      }),
      findCompletedParticipantPayment: jest.fn().mockResolvedValue({
        id: 'payment-1',
        amount: '100000.00',
        status: 'COMPLETED',
      }),
      findDivisionById: jest.fn().mockResolvedValue(null),
      getConfigValue: jest.fn().mockResolvedValue('0'),
      countParticipantPlayers: jest.fn().mockResolvedValue(1),
    };
    const service = new PaymentsService(
      repository as never,
      { sendNotification: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { reserveSlot: jest.fn(), releaseSlot: jest.fn() } as never,
    ) as unknown as {
      calculatePayment: (
        userId: string,
        data: unknown,
        tournament: unknown,
      ) => Promise<unknown>;
    };

    await expect(
      service.calculatePayment(
        'user-1',
        paymentData as never,
        tournament as never,
      ),
    ).rejects.toThrow('đã thanh toán');
  });

  it('allows a complete unpaid registration to calculate its team fee', async () => {
    const service = makeService({
      id: 'participant-1',
      tournamentId: 'tournament-1',
      registeredBy: 'user-1',
      isPaid: false,
      teamStatus: 'COMPLETE',
      tournamentDivisionId: null,
    });

    await expect(
      service.calculatePayment(
        'user-1',
        paymentData as never,
        tournament as never,
      ),
    ).resolves.toMatchObject({
      amount: 100000,
      participantId: 'participant-1',
    });
  });
});

describe('payment sandbox verification', () => {
  const makeMockService = (
    config: Record<string, string>,
    payment: Record<string, unknown>,
  ) => {
    const repository = {
      getConfigValue: jest
        .fn()
        .mockResolvedValue(config.PAYMENT_SANDBOX_ENABLED ?? 'false'),
      findPaymentById: jest.fn().mockResolvedValue(payment),
      transitionPayment: jest.fn(),
    };
    const service = new PaymentsService(
      repository as never,
      { sendNotification: jest.fn() } as never,
      { get: jest.fn((key: string) => config[key]) } as never,
      { confirmSlot: jest.fn(), releaseSlot: jest.fn() } as never,
    );
    return { service, repository };
  };

  it('denies mock verification when the system sandbox switch is off', async () => {
    const { service, repository } = makeMockService(
      {
        NODE_ENV: 'production',
        ENABLE_MOCK_PAYMENT: 'true',
        PAYMENT_SANDBOX_ENABLED: 'false',
      },
      { id: 'payment-1', userId: 'user-1', status: 'PENDING' },
    );

    await expect(service.mockVerify('user-1', 'payment-1')).rejects.toThrow(
      'Endpoint không tồn tại.',
    );
    expect(repository.findPaymentById).not.toHaveBeenCalled();
  });

  it('denies an authenticated caller who does not own the payment', async () => {
    const { service, repository } = makeMockService(
      {
        NODE_ENV: 'production',
        ENABLE_MOCK_PAYMENT: 'true',
        PAYMENT_SANDBOX_ENABLED: 'true',
      },
      { id: 'payment-1', userId: 'owner-1', status: 'PENDING' },
    );

    await expect(service.mockVerify('other-user', 'payment-1')).rejects.toThrow(
      'Bạn không có quyền xác minh giao dịch này.',
    );
    expect(repository.transitionPayment).not.toHaveBeenCalled();
  });

  it('returns an idempotent result for an already completed owned payment', async () => {
    const { service, repository } = makeMockService(
      {
        NODE_ENV: 'production',
        ENABLE_MOCK_PAYMENT: 'true',
        PAYMENT_SANDBOX_ENABLED: 'true',
      },
      { id: 'payment-1', userId: 'user-1', status: 'COMPLETED' },
    );

    await expect(service.mockVerify('user-1', 'payment-1')).resolves.toEqual({
      completed: true,
      idempotent: true,
    });
    expect(repository.transitionPayment).not.toHaveBeenCalled();
  });
});

describe('registration platform-fee authority', () => {
  it('uses the stored tournament snapshot rather than a changed global default', async () => {
    const repository = {
      findParticipantById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        tournamentId: 'tournament-1',
        registeredBy: 'user-1',
        isPaid: false,
        teamStatus: 'COMPLETE',
        tournamentDivisionId: 'division-1',
      }),
      findCompletedParticipantPayment: jest.fn().mockResolvedValue(null),
      findDivisionById: jest.fn().mockResolvedValue({
        id: 'division-1',
        tournamentId: 'tournament-1',
        entryFee: '200000',
      }),
      getConfigValue: jest.fn().mockResolvedValue('25'),
      countParticipantPlayers: jest.fn().mockResolvedValue(1),
    };
    const service = new PaymentsService(
      repository as never,
      { sendNotification: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { reserveSlot: jest.fn(), releaseSlot: jest.fn() } as never,
    ) as unknown as {
      calculatePayment: (
        userId: string,
        data: unknown,
        tournament: unknown,
      ) => Promise<unknown>;
    };

    await expect(
      service.calculatePayment('user-1', paymentData, {
        ...tournament,
        entryFee: '200000',
        platformFeePercentage: '5',
      }),
    ).resolves.toMatchObject({ amount: 200000, platformFeeAmount: 10000 });
    expect(repository.getConfigValue).not.toHaveBeenCalledWith(
      'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED',
      expect.anything(),
    );
  });
});
