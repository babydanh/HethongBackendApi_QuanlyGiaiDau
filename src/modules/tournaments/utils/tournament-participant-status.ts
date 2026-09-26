export type DoublesPairingMode = 'ORGANIZER' | 'SELF';
export type DoublesParticipantTransition =
  | {
      event: 'REGISTER';
      registrationMode: unknown;
      waitlisted: boolean;
      isLite?: boolean;
      pairingMode?: DoublesPairingMode;
      rosterCount?: number;
      hasPartnerInvite?: boolean;
    }
  | {
      event: 'APPROVE';
      registrationMode: unknown;
      isDoubles: boolean;
      rosterCount: number;
      isLite?: boolean;
      pairingMode?: DoublesPairingMode;
      hasPartnerInvite?: boolean;
    }
  | { event: 'PAIR' };

export type DoublesParticipantStatus =
  | 'WAITLISTED'
  | 'PENDING_APPROVAL'
  | 'PENDING_PARTNER'
  | 'COMPLETE';

export function resolveDoublesParticipantStatus(
  transition: DoublesParticipantTransition,
): DoublesParticipantStatus {
  switch (transition.event) {
    case 'REGISTER': {
      if (transition.waitlisted) return 'WAITLISTED';
      const pairingMode = transition.pairingMode ?? 'ORGANIZER';
      const rosterCount = transition.rosterCount ?? 1;
      const hasPartnerInvite = transition.hasPartnerInvite ?? false;

      if (
        transition.registrationMode === 'APPROVAL' &&
        transition.isLite !== true
      ) {
        if (rosterCount >= 2) return 'PENDING_APPROVAL';
        if (pairingMode === 'ORGANIZER' || !hasPartnerInvite) {
          return 'PENDING_APPROVAL';
        }
      }
      return rosterCount >= 2 ? 'COMPLETE' : 'PENDING_PARTNER';
    }
    case 'APPROVE':
      return transition.registrationMode === 'APPROVAL' &&
        transition.isLite !== true &&
        transition.isDoubles &&
        transition.rosterCount === 1
        ? 'PENDING_PARTNER'
        : 'COMPLETE';
    case 'PAIR':
      return 'COMPLETE';
  }
}
export function isDoublesParticipantPairable(
  teamStatus: string | null | undefined,
  teamInviteToken?: string | null,
): boolean {
  return teamStatus === 'PENDING_PARTNER' && !teamInviteToken;
}
