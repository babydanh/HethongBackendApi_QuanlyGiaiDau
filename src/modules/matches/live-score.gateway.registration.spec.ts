import { LiveScoreGateway } from './live-score.gateway';

describe('LiveScoreGateway registration updates', () => {
  it('publishes a scoped event to the tournament room', () => {
    const gateway = new LiveScoreGateway({} as any, {} as any);
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as unknown as { server: unknown }).server = { to };

    gateway.broadcastRegistrationUpdate('tournament-1', {
      participantId: 'participant-1',
      divisionId: 'division-1',
      action: 'REGISTERED',
    });

    expect(to).toHaveBeenCalledWith('tournament:tournament-1');
    const [, rawPayload] = emit.mock.calls[0] as [string, string];
    expect(JSON.parse(rawPayload)).toMatchObject({
      tournamentId: 'tournament-1',
      participantId: 'participant-1',
      divisionId: 'division-1',
      action: 'REGISTERED',
    });
    gateway.onApplicationShutdown();
  });

  it('adds tournament and participant division context to match updates', () => {
    const gateway = new LiveScoreGateway({} as any, {} as any);
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as unknown as { server: unknown }).server = { to };

    gateway.broadcastMatchStatus(
      'match-1',
      {
        id: 'match-1',
        status: 'ONGOING',
        participant1: { tournamentDivisionId: 'division-1' },
      },
      'tournament-1',
    );

    expect(to).toHaveBeenCalledWith('tournament:tournament-1');
    const [, rawPayload] = emit.mock.calls[1] as [string, string];
    expect(JSON.parse(rawPayload)).toMatchObject({
      id: 'match-1',
      tournamentId: 'tournament-1',
      divisionId: 'division-1',
      status: 'ONGOING',
    });
    gateway.onApplicationShutdown();
  });
});
