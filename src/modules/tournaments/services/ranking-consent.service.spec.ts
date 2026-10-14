import { PgDialect } from 'drizzle-orm/pg-core';
import {
  RankingConsentService,
  CONSENT_MAX_NOTIFICATIONS,
} from './ranking-consent.service';

const HOUR = 3_600_000;
const NOW = new Date('2026-06-10T12:00:00Z');

/** What dispatch finds for the roster row it is about to notify. */
const detailRow = () => ({
  userEmail: 'player@example.com',
  participantName: 'Nguyễn Văn A',
  tournamentName: 'Cup Đông Nam',
  tournamentId: 't-1',
  attempts: 0,
  consentedAt: null,
});

describe('RankingConsentService.sendDueReminders', () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

  /**
   * Resolves by call order: the first select is the candidate scan, every later
   * select is a dispatch looking up its own roster detail row.
   */
  const createDb = (candidates: unknown[]) => {
    let call = 0;
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.from = jest.fn(self);
    chain.innerJoin = jest.fn(self);
    chain.where = jest.fn(self);
    chain.limit = jest.fn(self);
    chain.update = jest.fn(self);
    chain.set = jest.fn(self);
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => {
        const value = call === 0 ? candidates : [detailRow()];
        call += 1;
        resolve(value);
      });
    return chain;
  };

  const build = (candidates: unknown[], sendOk = true) => {
    const db = createDb(candidates);
    const mailService = { sendMail: jest.fn().mockResolvedValue(sendOk) };
    const service = new RankingConsentService(
      db as never,
      mailService as never,
    );
    return { service, mailService };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a send that never landed, anchoring on the join time', async () => {
    // The reason notifiedAt NULL rows stay in scope: one mail outage must not
    // permanently silence the reminders, or the player never learns their
    // matches will go unscored.
    const { service, mailService } = build([
      { id: 'r1', attempts: 0, notifiedAt: null, joinedAt: hoursAgo(25) },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(1);
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('waits when the first reminder is not due yet', async () => {
    const { service, mailService } = build([
      { id: 'r1', attempts: 0, notifiedAt: null, joinedAt: hoursAgo(10) },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(0);
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('sends the first reminder 24h after the send at add time', async () => {
    // attempts === 1 means exactly one send landed — the one at add time — so the
    // first reminder is due 24h after THAT send, not 72h.
    const { service, mailService } = build([
      {
        id: 'r1',
        attempts: 1,
        notifiedAt: hoursAgo(30),
        joinedAt: hoursAgo(100),
      },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(1);
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('waits before the second reminder', async () => {
    // Two sends landed, so the 72h delay runs from the second one.
    const { service, mailService } = build([
      {
        id: 'r1',
        attempts: 2,
        notifiedAt: hoursAgo(30),
        joinedAt: hoursAgo(100),
      },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(0);
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('sends the second reminder once 72h have passed', async () => {
    const { service, mailService } = build([
      {
        id: 'r1',
        attempts: 2,
        notifiedAt: hoursAgo(73),
        joinedAt: hoursAgo(200),
      },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(1);
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('stops at the notification cap so nobody is nagged forever', async () => {
    const { service, mailService } = build([
      {
        id: 'r1',
        attempts: CONSENT_MAX_NOTIFICATIONS,
        notifiedAt: hoursAgo(200),
        joinedAt: hoursAgo(400),
      },
    ]);

    await expect(service.sendDueReminders()).resolves.toBe(0);
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('does not count a failed send as a delivered one', async () => {
    const { service } = build(
      [{ id: 'r1', attempts: 0, notifiedAt: null, joinedAt: hoursAgo(25) }],
      false,
    );

    await expect(service.sendDueReminders()).resolves.toBe(0);
  });
});

describe('RankingConsentService confirmation marks', () => {
  // Matches and ELO are saved only once the player confirmed BOTH the ranking consent and the
  // account link, so a reminder keeps going until both marks exist.
  const createDb = (detail: Record<string, unknown>, scansFirst = false) => {
    const wheres: unknown[] = [];
    let call = scansFirst ? 0 : 1;
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.from = jest.fn(self);
    chain.innerJoin = jest.fn(self);
    chain.where = jest.fn((predicate: unknown) => {
      wheres.push(predicate);
      return chain;
    });
    chain.limit = jest.fn(self);
    chain.update = jest.fn(self);
    chain.set = jest.fn(self);
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => {
        const value =
          call === 0
            ? [{ id: 'r1', attempts: 0, notifiedAt: null, joinedAt: new Date(0) }]
            : [detail];
        call += 1;
        resolve(value);
      });
    return { chain, wheres };
  };

  const build = (detail: Record<string, unknown>, scansFirst = false) => {
    const { chain, wheres } = createDb(detail, scansFirst);
    const mailService = { sendMail: jest.fn().mockResolvedValue(true) };
    const service = new RankingConsentService(chain as never, mailService as never);
    return { service, mailService, wheres };
  };

  const marked = new Date('2026-06-01T00:00:00Z');

  it('keeps reminding a player who consented to ranking but never confirmed the account link', async () => {
    const { service, mailService } = build({
      ...detailRow(),
      consentedAt: marked,
      linkConfirmedAt: null,
    });

    await expect(service.sendConfirmationRequest('r1')).resolves.toBe(true);
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('keeps reminding a player who confirmed the account link but never consented to ranking', async () => {
    const { service, mailService } = build({
      ...detailRow(),
      consentedAt: null,
      linkConfirmedAt: marked,
    });

    await expect(service.sendConfirmationRequest('r1')).resolves.toBe(true);
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('stops once both marks exist', async () => {
    const { service, mailService } = build({
      ...detailRow(),
      consentedAt: marked,
      linkConfirmedAt: marked,
    });

    await expect(service.sendConfirmationRequest('r1')).resolves.toBe(false);
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('scans rosters that lack either mark, not only the consent mark', async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      const { service, wheres } = build({ ...detailRow() }, true);

      await service.sendDueReminders();

      const { sql } = new PgDialect().sqlToQuery(wheres[0] as never);
      expect(sql).toMatch(
        /"ranking_consent_at" is null or "tournament_rosters"\."account_link_confirmed_at" is null|"account_link_confirmed_at" is null or "tournament_rosters"\."ranking_consent_at" is null/,
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
