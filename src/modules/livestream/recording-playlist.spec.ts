import {
  isValidRecordingPeriod,
  orderRecordingSegments,
  parseRecordingStartAt,
} from './recording-playlist';

describe('recording playlist segment ordering', () => {
  // Các đoạn thật của trận ngày 15/10 (AQP cắt khoảng 2 phút mỗi đoạn).
  const day15OctoberSegments = [
    '2026-10-15-23-04-29-1.mp4',
    '2026-10-15-23-11-02-0.mp4',
    '2026-10-15-23-02-30-0.mp4',
    '2026-10-15-23-10-32-4.mp4',
    '2026-10-15-23-08-31-3.mp4',
    '2026-10-15-23-06-30-2.mp4',
  ];

  it('reads the Vietnam-time start from a segment name as ISO with +07:00', () => {
    expect(parseRecordingStartAt('2026-10-15-23-04-29-1.mp4')).toBe(
      '2026-10-15T23:04:29+07:00',
    );
  });

  it('orders the 15/10 segments by start time and places an unreadable name last', () => {
    const ordered = orderRecordingSegments([
      'ten-khong-hop-le.mp4',
      ...day15OctoberSegments,
    ]);

    expect(ordered).toEqual([
      { name: '2026-10-15-23-02-30-0.mp4', startAt: '2026-10-15T23:02:30+07:00' },
      { name: '2026-10-15-23-04-29-1.mp4', startAt: '2026-10-15T23:04:29+07:00' },
      { name: '2026-10-15-23-06-30-2.mp4', startAt: '2026-10-15T23:06:30+07:00' },
      { name: '2026-10-15-23-08-31-3.mp4', startAt: '2026-10-15T23:08:31+07:00' },
      { name: '2026-10-15-23-10-32-4.mp4', startAt: '2026-10-15T23:10:32+07:00' },
      { name: '2026-10-15-23-11-02-0.mp4', startAt: '2026-10-15T23:11:02+07:00' },
      { name: 'ten-khong-hop-le.mp4', startAt: null },
    ]);
  });

  it('keeps unreadable names after every readable one, ordered by name', () => {
    const ordered = orderRecordingSegments([
      'zeta.mp4',
      '2026-10-15-23-02-30-0.mp4',
      'alpha.mp4',
    ]);

    expect(ordered.map((segment) => segment.name)).toEqual([
      '2026-10-15-23-02-30-0.mp4',
      'alpha.mp4',
      'zeta.mp4',
    ]);
  });

  it('orders segments sharing the same second by their numeric index', () => {
    const ordered = orderRecordingSegments([
      '2026-10-15-23-02-30-10.mp4',
      '2026-10-15-23-02-30-2.mp4',
    ]);

    expect(ordered.map((segment) => segment.name)).toEqual([
      '2026-10-15-23-02-30-2.mp4',
      '2026-10-15-23-02-30-10.mp4',
    ]);
  });

  it('drops duplicate names so one file is listed once', () => {
    const ordered = orderRecordingSegments([
      '2026-10-15-23-02-30-0.mp4',
      '2026-10-15-23-02-30-0.mp4',
    ]);

    expect(ordered).toHaveLength(1);
  });

  it.each([
    ['intro.mp4', 'không có dạng ngày giờ'],
    ['2026-10-15-23-04-29.mp4', 'thiếu chỉ số <n>'],
    ['2026-10-15-23-04-29-1.mov', 'sai đuôi file'],
    ['x2026-10-15-23-04-29-1.mp4', 'có tiền tố lạ'],
    ['2026-02-30-23-04-29-1.mp4', 'ngày không tồn tại'],
    ['2026-10-15-24-00-00-1.mp4', 'giờ 24'],
    ['2026-10-15-23-60-00-1.mp4', 'phút 60'],
    ['2026-10-15-23-04-60-1.mp4', 'giây 60'],
  ])('gives no start time to %s (%s)', (name) => {
    expect(parseRecordingStartAt(name)).toBeNull();
  });

  it.each(['2024-02-29', '2026-10-15'])(
    'accepts the calendar period %s',
    (period) => {
      expect(isValidRecordingPeriod(period)).toBe(true);
    },
  );

  it.each(['2025-02-29', '2026-13-01', '2026-10-15T00:00:00Z', 20261015])(
    'rejects the calendar period %s',
    (period) => {
      expect(isValidRecordingPeriod(period)).toBe(false);
    },
  );
});
