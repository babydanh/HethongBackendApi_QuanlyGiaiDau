const mockInit = jest.fn();

jest.mock('@sentry/nestjs', () => ({
  init: (...args: unknown[]) => mockInit(...args),
}));

type BeforeSend = (event: Record<string, unknown>) => Record<string, unknown>;

describe('Sentry Add Athlete request redaction', () => {
  const originalDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    jest.resetModules();
    mockInit.mockReset();
    process.env.SENTRY_DSN = 'https://public@example.test/1';
  });

  afterAll(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
  });

  it('removes search and candidate identity data from the emitted Sentry event', () => {
    jest.isolateModules(() => {
      require('./instrument');
    });

    const config = mockInit.mock.calls[0]?.[0] as {
      beforeSend: BeforeSend;
    } | undefined;
    expect(config).toBeDefined();

    const rawName = 'Sensitive Athlete Name';
    const rawEmail = 'private.athlete@example.test';
    const rawUserId = 'd9cfd7bd-5b76-4b55-baa5-4eb140b227a8';
    const event = {
      request: {
        url: 'https://api.example.test/tournaments/8a6e5d40-2431-4c22-8b11-1338e4b37a37/add-athletes/search',
        data: { name: rawName, email: rawEmail },
        query_string: `email=${rawEmail}`,
      },
      extra: { candidate: { userId: rawUserId, email: rawEmail } },
      breadcrumbs: [
        { message: `search ${rawEmail}`, data: { query: rawName, userId: rawUserId } },
      ],
      exception: { values: [{ type: 'Error', value: `failed for ${rawEmail}` }] },
      user: { id: rawUserId, email: rawEmail },
    };

    const redacted = config!.beforeSend(event);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain(rawName);
    expect(serialized).not.toContain(rawEmail);
    expect(serialized).not.toContain(rawUserId);
  });
});
