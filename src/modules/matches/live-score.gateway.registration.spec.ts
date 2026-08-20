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
});
