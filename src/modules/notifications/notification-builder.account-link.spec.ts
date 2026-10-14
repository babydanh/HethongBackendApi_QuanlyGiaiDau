import { buildAccountLinkConfirmationNotification } from './notification-builder';
import {
  NOTIFICATION_TYPES,
  SENDER_ATTRIBUTED_NOTIFICATION_TYPES,
} from './notification-types';

describe('buildAccountLinkConfirmationNotification', () => {
  const base = {
    tournamentId: '00000000-0000-4000-8000-000000000001',
    tournamentName: 'Giải mùa thu',
    receiverId: 'player-1',
    senderId: 'organizer-1',
  };

  it('addresses the added player and names the organizer who added them', () => {
    const notification = buildAccountLinkConfirmationNotification(base);

    expect(notification).toMatchObject({
      receiverId: 'player-1',
      senderId: 'organizer-1',
      type: NOTIFICATION_TYPES.TOURNAMENT_ACCOUNT_LINK_CONFIRMATION,
    });
  });

  it('points at the tournament page, which is where the confirmation banner and the web action live', () => {
    const notification = buildAccountLinkConfirmationNotification(base);

    expect(notification.redirectUrl).toBe(`/tournaments/${base.tournamentId}`);
  });

  it('keeps the division in the link when the player was added to one', () => {
    const notification = buildAccountLinkConfirmationNotification({
      ...base,
      divisionId: 'division-9',
    });

    expect(notification.redirectUrl).toBe(
      `/tournaments/${base.tournamentId}?divisionId=division-9`,
    );
  });

  it('says what confirming changes and what not confirming leaves alone', () => {
    const { title, content } = buildAccountLinkConfirmationNotification(base);

    expect(title).toBe('Xác nhận tham gia giải đấu');
    expect(content).toContain('Giải mùa thu');
    // Confirming is what saves matches and ELO, from that moment on only.
    expect(content).toMatch(/ELO/);
    expect(content).toMatch(/từ lúc bạn xác nhận/);
    // Not confirming must not read as being dropped from the tournament.
    expect(content).toMatch(/vẫn (thi đấu|tham gia)/);
  });

  it('never carries an email address or phone number in the text the player reads', () => {
    // The link is not checked here: it holds the tournament id, whose last UUID group is 12 digits.
    const { title, content } = buildAccountLinkConfirmationNotification(base);

    expect(`${title} ${content}`).not.toMatch(/@|\d{9,}/);
  });

  it('is one of the types that show who sent them, so the web can show the organizer avatar', () => {
    expect(SENDER_ATTRIBUTED_NOTIFICATION_TYPES).toContain(
      NOTIFICATION_TYPES.TOURNAMENT_ACCOUNT_LINK_CONFIRMATION,
    );
  });
});
