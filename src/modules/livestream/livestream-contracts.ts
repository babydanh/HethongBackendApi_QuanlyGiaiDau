export const LIVESTREAM_PROVIDERS = ['FACEBOOK', 'INTERNAL'] as const;
export type LivestreamProvider = (typeof LIVESTREAM_PROVIDERS)[number];

export const FACEBOOK_CONNECTION_STATUSES = [
  'ACTIVE',
  'CHECKING',
  'EXPIRED',
  'REVOKED',
  'DISCONNECTED',
] as const;
export type FacebookConnectionStatus = (typeof FACEBOOK_CONNECTION_STATUSES)[number];

export const CAMERA_DEVICE_STATUSES = [
  'UNPAIRED',
  'READY',
  'ONLINE',
  'LIVE',
  'OFFLINE',
  'REVOKED',
] as const;
export type CameraDeviceStatus = (typeof CAMERA_DEVICE_STATUSES)[number];

export const LIVE_SESSION_STATUSES = [
  'CREATED',
  'STARTING',
  'LIVE',
  'RECONNECTING',
  'STOPPING',
  'ENDED',
  'FAILED',
] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const REPLAY_PROVIDERS = ['FACEBOOK', 'YOUTUBE', 'NONE'] as const;
export type ReplayProvider = (typeof REPLAY_PROVIDERS)[number];

export const LIVESTREAM_FAILURE_CODES = [
  'FACEBOOK_NOT_CONNECTED',
  'FACEBOOK_CONNECTION_EXPIRED',
  'FACEBOOK_PERMISSION_MISSING',
  'CAMERA_NOT_READY',
  'CAMERA_ALREADY_LIVE',
  'COURT_ALREADY_LIVE',
  'MATCH_ALREADY_LIVE',
  'SESSION_NOT_FOUND',
  'INVALID_SESSION_TRANSITION',
  'PROVIDER_UNAVAILABLE',
  'PUBLISH_CONFIG_EXPIRED',
  'UNKNOWN_PROVIDER_ERROR',
] as const;
export type LivestreamFailureCode = (typeof LIVESTREAM_FAILURE_CODES)[number];

export const ACTIVE_LIVE_SESSION_STATUSES: readonly LiveSessionStatus[] = [
  'CREATED',
  'STARTING',
  'LIVE',
  'RECONNECTING',
  'STOPPING',
];

export function isLiveSessionStatus(value: string): value is LiveSessionStatus {
  return (LIVE_SESSION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionLiveSession(
  from: LiveSessionStatus,
  to: LiveSessionStatus,
): boolean {
  const transitions: Record<LiveSessionStatus, readonly LiveSessionStatus[]> = {
    CREATED: ['STARTING', 'FAILED'],
    STARTING: ['LIVE', 'FAILED', 'STOPPING'],
    LIVE: ['RECONNECTING', 'STOPPING', 'FAILED'],
    RECONNECTING: ['LIVE', 'STOPPING', 'FAILED'],
    STOPPING: ['ENDED', 'FAILED'],
    ENDED: [],
    FAILED: [],
  };

  return transitions[from].includes(to);
}

export function isActiveLiveSessionStatus(status: LiveSessionStatus): boolean {
  return ACTIVE_LIVE_SESSION_STATUSES.includes(status);
}
