import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway connection authentication', () => {
  const createClient = (overrides: Record<string, unknown> = {}) => ({
    handshake: {
      auth: {},
      headers: {},
      query: {},
    },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  });

  it('authenticates the handshake before joining the user notification room', () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: 'user-1' }) };
    const gateway = new NotificationsGateway(jwtService as never);
    const client = createClient({
      handshake: {
        auth: { token: 'access-token' },
        headers: {},
        query: {},
      },
    });

    gateway.handleConnection(client as never);

    expect(jwtService.verify).toHaveBeenCalledWith('access-token');
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts Flutter-style Authorization handshake headers', () => {
    const jwtService = { verify: jest.fn().mockReturnValue({ sub: 'user-2' }) };
    const gateway = new NotificationsGateway(jwtService as never);
    const client = createClient({
      handshake: {
        auth: {},
        headers: { authorization: 'Bearer mobile-token' },
        query: {},
      },
    });

    gateway.handleConnection(client as never);

    expect(jwtService.verify).toHaveBeenCalledWith('mobile-token');
    expect(client.join).toHaveBeenCalledWith('user:user-2');
  });

  it('disconnects an unauthenticated socket without joining a room', () => {
    const jwtService = { verify: jest.fn() };
    const gateway = new NotificationsGateway(jwtService as never);
    const client = createClient();

    gateway.handleConnection(client as never);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });
});
