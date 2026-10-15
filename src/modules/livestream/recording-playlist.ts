/**
 * Đọc giờ bắt đầu và xếp thứ tự các đoạn ghi MP4 do AQP cắt.
 *
 * Tên file dạng `YYYY-MM-DD-HH-MM-SS-<n>.mp4`, giờ là giờ Việt Nam (UTC+07:00).
 * Tên không đúng dạng (hoặc ngày/giờ không tồn tại) không có giờ bắt đầu và
 * được xếp cuối danh sách theo tên.
 */

const DAYS_IN_COMMON_YEAR = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

const RECORDING_SEGMENT_NAME =
  /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d+)\.mp4$/i;

const collator = new Intl.Collator('en', { numeric: true });

export function isValidRecordingPeriod(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1 || month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = DAYS_IN_COMMON_YEAR[month - 1] ?? 0;
  const maxDay = month === 2 && leapYear ? 29 : daysInMonth;
  return day >= 1 && day <= maxDay;
}

/** Giờ bắt đầu dạng ISO 8601 kèm offset +07:00, hoặc null nếu tên không đọc được. */
export function parseRecordingStartAt(name: string): string | null {
  const parts = RECORDING_SEGMENT_NAME.exec(name);
  if (!parts) return null;

  const [, year, month, day, hour, minute, second] = parts;
  if (!isValidRecordingPeriod(`${year}-${month}-${day}`)) return null;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    return null;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
}

export interface RecordingSegmentOrder {
  readonly name: string;
  readonly startAt: string | null;
}

/**
 * Xếp tên file theo giờ bắt đầu tăng dần; tên trùng bị bỏ. Đoạn không đọc được
 * giờ xếp sau cùng, theo tên. Hai đoạn cùng giờ xếp theo tên, số `<n>` so sánh
 * theo giá trị số (để `-2` đứng trước `-10`).
 */
export function orderRecordingSegments(
  names: readonly string[],
): RecordingSegmentOrder[] {
  return [...new Set(names)]
    .map((name) => {
      const startAt = parseRecordingStartAt(name);
      return {
        name,
        startAt,
        startMs: startAt === null ? null : Date.parse(startAt),
      };
    })
    .sort((a, b) => {
      if (a.startMs !== null && b.startMs !== null) {
        return a.startMs - b.startMs || collator.compare(a.name, b.name);
      }
      if (a.startMs !== null) return -1;
      if (b.startMs !== null) return 1;
      return collator.compare(a.name, b.name);
    })
    .map(({ name, startAt }) => ({ name, startAt }));
}
