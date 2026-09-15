const OPEN_STATUS = 'REGISTRATION_OPEN';

export const isRegistrationOpenStatus = (status?: string | null) =>
  status === OPEN_STATUS;

export const canOpenRegistrationImmediately = (status?: string | null) =>
  status === 'UPCOMING' || status === 'REGISTRATION_CLOSED';

export const isRegistrationDeadlineExpired = (
  deadline?: Date | string | null,
  now = new Date(),
) => Boolean(deadline && new Date(deadline).getTime() <= now.getTime());
