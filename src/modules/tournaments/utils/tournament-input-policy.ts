import { BadRequestException } from '@nestjs/common';
import type { CategoryConfig } from '../interfaces/tournament-config.interface';

export function readSupportedMatchTypes(
  categoryConfig: CategoryConfig | null | undefined,
) {
  return Array.isArray(categoryConfig?.supportedMatchTypes)
    ? categoryConfig.supportedMatchTypes
    : null;
}

export function validateMatchTypeAgainstCategory(
  categoryConfig: CategoryConfig | null | undefined,
  matchType: string | null | undefined,
  sourceLabel: string,
) {
  if (!matchType) {
    return;
  }

  const supportedMatchTypes = readSupportedMatchTypes(categoryConfig);
  if (
    supportedMatchTypes &&
    !supportedMatchTypes.includes(
      matchType as 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES',
    )
  ) {
    throw new BadRequestException(
      `${sourceLabel}: môn này không hỗ trợ hình thức ${matchType}. Cho phép: ${supportedMatchTypes.join(', ')}.`,
    );
  }
}

export function validateMatchTypeGenderRestriction(
  matchType: string | null | undefined,
  genderRestriction: string | null | undefined,
  sourceLabel: string,
) {
  if (!matchType) {
    return;
  }

  if (matchType === 'MIXED_DOUBLES' && genderRestriction !== 'MIXED') {
    throw new BadRequestException(
      `${sourceLabel}: MIXED_DOUBLES phải đi cùng genderRestriction = MIXED.`,
    );
  }

  if (
    (matchType === 'SINGLES' || matchType === 'DOUBLES') &&
    genderRestriction === 'MIXED'
  ) {
    throw new BadRequestException(
      `${sourceLabel}: chỉ MIXED_DOUBLES mới được dùng genderRestriction = MIXED.`,
    );
  }
}

export function validateRegistrationMode(config: unknown): void {
  if (!config || typeof config !== 'object') return;

  const record = config as Record<string, unknown>;
  const registrationMode = record.registrationMode;
  if (registrationMode !== undefined) {
    if (
      typeof registrationMode !== 'string' ||
      !['OPEN', 'APPROVAL', 'INVITE_ONLY'].includes(registrationMode)
    ) {
      throw new BadRequestException(
        'Chế độ đăng ký phải là một trong: OPEN, APPROVAL, INVITE_ONLY',
      );
    }
  }

  const doublesPairingMode = record.doublesPairingMode;
  if (
    doublesPairingMode !== undefined &&
    (typeof doublesPairingMode !== 'string' ||
      !['ORGANIZER', 'SELF'].includes(doublesPairingMode))
  ) {
    throw new BadRequestException(
      'Chế độ ghép đôi phải là một trong: ORGANIZER, SELF',
    );
  }
}

export function applyDefaultDoublesPairingMode(
  matchType: string | null | undefined,
  config: Record<string, unknown>,
) {
  const isDoubles = isDoublesMatchType(matchType);
  if (isDoubles && config.doublesPairingMode === undefined) {
    return { ...config, doublesPairingMode: 'ORGANIZER' };
  }
  return config;
}

export function isDoublesMatchType(matchType: string | null | undefined) {
  return matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
}
