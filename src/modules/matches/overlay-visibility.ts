/** Overlay trên sóng live của trận: banner đối đầu (H2H) hoặc bảng nhánh (BRACKET). */
export type OverlayKind = 'H2H' | 'BRACKET';

export type OverlayVisibilityState = {
  h2hOverlayVisible: boolean;
  bracketOverlayVisible: boolean;
};

/**
 * Cột cần ghi cho một lệnh bật/tắt overlay, gói trong một UPDATE duy nhất.
 * Bật một overlay thì overlay còn lại tắt (sóng chỉ hiện một overlay tại một
 * thời điểm); tắt thì chỉ đụng tới cờ của chính nó.
 */
export function overlayVisibilityPatch(
  kind: OverlayKind,
  visible: boolean,
): Partial<OverlayVisibilityState> {
  if (kind === 'H2H') {
    return visible
      ? { h2hOverlayVisible: true, bracketOverlayVisible: false }
      : { h2hOverlayVisible: false };
  }
  return visible
    ? { bracketOverlayVisible: true, h2hOverlayVisible: false }
    : { bracketOverlayVisible: false };
}

/** Phản hồi PATCH và payload socket: luôn đủ cả hai cờ. */
export function toOverlayVisibilityState(
  matchId: string,
  state: OverlayVisibilityState,
) {
  return {
    id: matchId,
    matchId,
    h2hOverlayVisible: state.h2hOverlayVisible,
    bracketOverlayVisible: state.bracketOverlayVisible,
  };
}
