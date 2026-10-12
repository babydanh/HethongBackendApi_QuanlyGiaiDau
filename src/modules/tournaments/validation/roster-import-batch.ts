import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { RosterPreviewRow, RosterRowStatus } from './roster-import';
import { normalizeRosterEmail, ROSTER_EMAIL_PATTERN } from './roster-import';

export const MAX_ROSTER_IMPORT_BATCH_PARTICIPANTS = 500;

export interface RosterImportBatchParticipant {
  player1Email?: string;
  player2Name?: string;
  player2Email?: string;
  player2Phone?: string;
  [key: string]: unknown;
}

export interface RosterImportBatchGroup<T extends RosterImportBatchParticipant = RosterImportBatchParticipant> {
  divisionId: string | null;
  participants: T[];
}

export interface ValidatedRosterImportBatchGroup<T extends RosterImportBatchParticipant = RosterImportBatchParticipant>
  extends RosterImportBatchGroup<T> {
  rows: RosterPreviewRow[];
  requestedTeamSlots: number;
}

export interface RosterAccountCandidate {
  id: string;
  email: string;
}

function participantCount(item: RosterImportBatchParticipant): number {
  const hasSecondPlayer = Boolean(
    item.player2Name?.trim() ||
      item.player2Email?.trim() ||
      item.player2Phone?.trim(),
  );
  return hasSecondPlayer ? 2 : 1;
}

export function validateRosterImportBatchGroups(
  groups: readonly RosterImportBatchGroup[],
): number {
  if (groups.length === 0 || groups.length > MAX_ROSTER_IMPORT_BATCH_PARTICIPANTS) {
    throw new BadRequestException('Workbook không có nhóm roster hợp lệ.');
  }

  const seenDivisions = new Set<string>();
  let totalParticipants = 0;
  for (const group of groups) {
    const divisionKey = group.divisionId ?? '';
    if (seenDivisions.has(divisionKey)) {
      throw new BadRequestException('Mỗi division chỉ được xuất hiện một lần.');
    }
    seenDivisions.add(divisionKey);
    if (group.participants.length === 0) {
      throw new BadRequestException('Không thể nhập một division không có dòng dữ liệu.');
    }
    for (const participant of group.participants) {
      totalParticipants += participantCount(participant);
      if (totalParticipants > MAX_ROSTER_IMPORT_BATCH_PARTICIPANTS) {
        throw new BadRequestException(
          `Workbook chỉ được có tối đa ${MAX_ROSTER_IMPORT_BATCH_PARTICIPANTS} VĐV.`,
        );
      }
    }
  }
  return totalParticipants;
}

export function markRosterBatchDuplicateEmails<
  T extends RosterImportBatchParticipant,
>(
  groups: readonly ValidatedRosterImportBatchGroup<T>[],
): ValidatedRosterImportBatchGroup<T>[] {
  const rowsByEmail = new Map<string, Set<RosterPreviewRow>>();
  for (const group of groups) {
    group.participants.forEach((participant, index) => {
      const row = group.rows[index];
      for (const rawEmail of [participant.player1Email, participant.player2Email]) {
        const email = rawEmail?.trim() ? normalizeRosterEmail(rawEmail) : '';
        if (!ROSTER_EMAIL_PATTERN.test(email)) continue;
        const rows = rowsByEmail.get(email);
        if (rows) rows.add(row);
        else rowsByEmail.set(email, new Set([row]));
      }
    });
  }

  const duplicates = new Set<RosterPreviewRow>();
  for (const rows of rowsByEmail.values()) {
    if (rows.size > 1) for (const row of rows) duplicates.add(row);
  }

  return groups.map((group) => {
    const rows = group.rows.map((row) => {
      if (!duplicates.has(row)) return row;
      return {
        ...row,
        status: row.status.includes('DUPLICATE_IN_FILE')
          ? row.status
          : [...row.status, 'DUPLICATE_IN_FILE' as RosterRowStatus],
        isEligible: false,
      };
    });
    return {
      ...group,
      rows,
      requestedTeamSlots: rows.reduce(
        (total, row) => total + (row.isEligible ? row.capacityDelta : 0),
        0,
      ),
    };
  });
}

export function resolveConfirmedRosterUserId(
  rawEmail: string,
  selectedUserId: string | undefined,
  candidatesByEmail: ReadonlyMap<string, RosterAccountCandidate>,
): string | null {
  if (!selectedUserId) return null;
  const email = normalizeRosterEmail(rawEmail);
  const candidate = candidatesByEmail.get(email);
  if (!candidate || candidate.id !== selectedUserId || normalizeRosterEmail(candidate.email) !== email) {
    throw new ConflictException(
      'Tài khoản được chọn không còn khớp với email hoặc không còn đủ điều kiện.',
    );
  }
  return candidate.id;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function fingerprintRosterImportBatch(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function validateRosterImportIdempotencyKey(
  value: string | undefined,
): string {
  if (
    !value ||
    value.length > 128 ||
    value.trim() !== value ||
    /\s/.test(value)
  ) {
    throw new BadRequestException(
      'Idempotency-Key phải có từ 1 đến 128 ký tự, không chứa khoảng trắng.',
    );
  }
  return value;
}

export type RegistrationFormForRosterImport = {
  status?: unknown;
  divisionIds?: unknown;
  fields?: unknown;
};

type RegistrationFieldForRosterImport = Record<string, unknown> & {
  id: string;
  type: string;
};

const RESERVED_ROSTER_RESPONSE_KEYS = new Set([
  'notes',
  'importedFrom',
  'entryType',
  'player1Email',
  'player1Phone',
  'player2Name',
  'player2Email',
  'player2Phone',
  'is_wildcard',
  'sourceFileName',
  'sourceRowIndex',
  'sourceSheetName',
]);


function isEmptyResponse(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function registrationFieldLabel(
  field: RegistrationFieldForRosterImport,
): string {
  return typeof field.label === 'string' && field.label
    ? field.label
    : field.id;
}

function validateRegistrationFieldValue(
  field: RegistrationFieldForRosterImport,
  value: unknown,
): unknown {
  const label = registrationFieldLabel(field);
  switch (field.type) {
    case 'TEXT':
    case 'TEXTAREA':
      if (typeof value !== 'string' || value.length > 4000) break;
      return value;
    case 'EMAIL':
      if (typeof value === 'string' && ROSTER_EMAIL_PATTERN.test(value.trim())) {
        return value.trim();
      }
      break;
    case 'PHONE':
      if (typeof value === 'string' && /^(?:\+84|0[35789])\d{8}$/.test(value.trim())) {
        return value.trim();
      }
      break;
    case 'NUMBER': {
      if (typeof value !== 'string' && typeof value !== 'number') break;
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) break;
      if (typeof field.min === 'number' && number < field.min) break;
      if (typeof field.max === 'number' && number > field.max) break;
      return number;
    }
    case 'SELECT':
      if (
        typeof value === 'string' &&
        Array.isArray(field.options) &&
        field.options.includes(value)
      ) {
        return value;
      }
      break;
    case 'MULTI_SELECT': {
      const options = field.options;
      if (
        Array.isArray(value) &&
        Array.isArray(options) &&
        value.every(
          (item) => typeof item === 'string' && options.includes(item),
        )
      ) {
        return [...value];
      }
      break;
    }
    case 'CHECKBOX':
      if (typeof value === 'boolean') return value;
      break;
  }
  throw new BadRequestException(
    `Giá trị trường “${label}” không hợp lệ hoặc không được hỗ trợ khi nhập Excel.`,
  );
}

export function validateRosterImportCustomResponses(
  rawResponses: unknown,
  rawForm: RegistrationFormForRosterImport | null | undefined,
  divisionId: string | null,
): Record<string, unknown> {
  if (
    rawResponses !== undefined &&
    rawResponses !== null &&
    (typeof rawResponses !== 'object' || Array.isArray(rawResponses))
  ) {
    throw new BadRequestException('Dữ liệu câu trả lời bổ sung không hợp lệ.');
  }
  const responses = (rawResponses ?? {}) as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const notes = responses.notes;
  if (notes !== undefined) {
    if (typeof notes !== 'string' || notes.length > 2000) {
      throw new BadRequestException('Ghi chú chỉ được là văn bản tối đa 2000 ký tự.');
    }
    if (notes.trim()) normalized.notes = notes.trim();
  }

  if (responses.sourceFileName !== undefined) {
    if (
      typeof responses.sourceFileName !== 'string' ||
      !responses.sourceFileName.trim() ||
      responses.sourceFileName.length > 31
    ) {
      throw new BadRequestException('Tên tệp nguồn không hợp lệ.');
    }
    normalized.sourceFileName = responses.sourceFileName.trim();
  }
  if (responses.sourceRowIndex !== undefined) {
    if (
      typeof responses.sourceRowIndex !== 'number' ||
      !Number.isInteger(responses.sourceRowIndex) ||
      responses.sourceRowIndex < 1 ||
      responses.sourceRowIndex > 1048576
    ) {
      throw new BadRequestException('Số dòng worksheet nguồn không hợp lệ.');
    }
    normalized.sourceRowIndex = responses.sourceRowIndex;
  }
  if (responses.sourceSheetName !== undefined) {
    if (
      typeof responses.sourceSheetName !== 'string' ||
      !responses.sourceSheetName.trim() ||
      responses.sourceSheetName.length > 31
    ) {
      throw new BadRequestException('Tên sheet nguồn không hợp lệ.');
    }
    normalized.sourceSheetName = responses.sourceSheetName.trim();
  }

  const formApplies = Boolean(
    rawForm?.status === 'PUBLISHED' &&
      divisionId &&
      (!Array.isArray(rawForm.divisionIds) ||
        rawForm.divisionIds.length === 0 ||
        rawForm.divisionIds.includes(divisionId)),
  );
  const fields: RegistrationFieldForRosterImport[] = [];
  if (formApplies && Array.isArray(rawForm?.fields)) {
    for (const rawField of rawForm.fields) {
      if (
        !rawField ||
        typeof rawField !== 'object' ||
        Array.isArray(rawField)
      ) {
        continue;
      }
      const field = rawField as Record<string, unknown>;
      if (
        typeof field.id !== 'string' ||
        !field.id ||
        typeof field.type !== 'string' ||
        RESERVED_ROSTER_RESPONSE_KEYS.has(field.id)
      ) {
        continue;
      }
      fields.push(field as RegistrationFieldForRosterImport);
    }
  }
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  for (const [fieldId, value] of Object.entries(responses)) {
    if (RESERVED_ROSTER_RESPONSE_KEYS.has(fieldId)) {
      if (!Object.prototype.hasOwnProperty.call(normalized, fieldId)) {
        normalized[fieldId] = value;
      }
      continue;
    }
    const field = fieldsById.get(fieldId);
    if (!field) {
      throw new BadRequestException(
        'Có cột bổ sung chưa được cho phép trong biểu mẫu đăng ký đang công bố.',
      );
    }
    if (isEmptyResponse(value)) continue;
    normalized[fieldId] = validateRegistrationFieldValue(field, value);
  }

  for (const field of fields) {
    if (
      field.required === true &&
      (isEmptyResponse(normalized[field.id]) ||
        (field.type === 'CHECKBOX' && normalized[field.id] !== true))
    ) {
      throw new BadRequestException(
        `Vui lòng điền trường “${registrationFieldLabel(field)}”.`,
      );
    }
  }
  return normalized;
}

export interface RosterBatchCapacityClaim {
  ownerKey: string;
  occupiedTeamSlots: number;
  maxTeamSlots: number | null;
  requestedTeamSlots: number;
}

export function groupRosterBatchCapacityClaims(
  claims: readonly RosterBatchCapacityClaim[],
): RosterBatchCapacityClaim[] {
  const grouped = new Map<string, RosterBatchCapacityClaim>();
  for (const claim of claims) {
    const current = grouped.get(claim.ownerKey);
    if (!current) {
      grouped.set(claim.ownerKey, { ...claim });
      continue;
    }
    if (
      current.occupiedTeamSlots !== claim.occupiedTeamSlots ||
      current.maxTeamSlots !== claim.maxTeamSlots
    ) {
      throw new ConflictException('Dữ liệu capacity đã thay đổi trong lúc nhập.');
    }
    current.requestedTeamSlots += claim.requestedTeamSlots;
  }
  return [...grouped.values()];
}

export function assertRosterBatchCapacityHasRoom(
  claims: readonly RosterBatchCapacityClaim[],
): void {
  for (const claim of claims) {
    if (
      claim.maxTeamSlots !== null &&
      claim.occupiedTeamSlots + claim.requestedTeamSlots >
        claim.maxTeamSlots
    ) {
      throw new BadRequestException('Nội dung thi đấu đã đầy.');
    }
  }
}
