import type {
  OverlayExpectedMembers,
  OverlayParticipantInput,
  OverlaySide,
} from './overlay.types';

export const WAITING_PARTNER_NOTE = '(chờ đồng đội)';

/** NBSP, khoảng trắng hẹp và các biến thể khác thành khoảng trắng thường. */
const SPACE_LIKE = /[\u00A0\u2007\u202F]/g;

/** NFC, bỏ NBSP, gộp khoảng trắng đôi, cắt hai đầu. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(SPACE_LIKE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const lower = (text: string): string => text.toLocaleLowerCase('vi');

/** Lấy `count` từ cuối của họ tên đã chuẩn hoá (tên gọi theo cách đặt tên Việt). */
function lastWords(fullName: string, count: number): string {
  return fullName.split(' ').slice(-count).join(' ');
}

function initialOf(text: string): string {
  const first = Array.from(text)[0];
  return first ? first.toLocaleUpperCase('vi') : '?';
}

/**
 * Tên một bên của trận. `participant.members` đã được lọc (roster ACTIVE, MAIN) và sắp
 * theo thời điểm vào ở lớp truy vấn.
 *
 * - 1 hoặc 2 thành viên đều có tên: ghép tên gọi bằng " - "; trùng tên gọi (không phân biệt
 *   hoa thường) trong cùng một bên thì dùng 2 từ cuối cho cả hai.
 * - Không có thành viên, từ 3 người, hoặc có người thiếu tên: dùng `teamName`, không avatar.
 * - Nội dung đôi mà mới có 1 người: kèm ghi chú chờ đồng đội.
 */
export function buildSide(
  participant: Pick<OverlayParticipantInput, 'teamName' | 'members'>,
  expectedMembers: OverlayExpectedMembers,
): OverlaySide {
  const teamName = normalizeText(participant.teamName);
  const { members } = participant;
  const teamSide: OverlaySide = { name: teamName, note: null, avatars: [] };

  if (members.length === 0 || members.length > 2) return teamSide;
  const fullNames = members.map((member) => normalizeText(member.fullName));
  if (fullNames.some((fullName) => fullName === '')) return teamSide;

  let shortNames = fullNames.map((fullName) => lastWords(fullName, 1));
  if (
    shortNames.length === 2 &&
    lower(shortNames[0]) === lower(shortNames[1])
  ) {
    shortNames = fullNames.map((fullName) => lastWords(fullName, 2));
  }

  return {
    name: shortNames.join(' - '),
    note:
      expectedMembers === 2 && members.length === 1
        ? WAITING_PARTNER_NOTE
        : null,
    avatars: members.map((member, index) => ({
      url: member.avatarUrl ?? null,
      initial: initialOf(shortNames[index]),
    })),
  };
}
