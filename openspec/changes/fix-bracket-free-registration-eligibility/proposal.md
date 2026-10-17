## Why

Change `fix-bracket-doubles-generation` (17/10) thống nhất điều kiện đội vào sơ đồ: `COMPLETE` và (`isPaid` hoặc `organizerWaivedFee` hoặc `isMock`). Điều kiện này bỏ qua ảnh chụp phí lúc đăng ký (`entryFeeAtRegistration`). Quy tắc thanh toán chuẩn của hệ thống (`isRegistrationFeePaid`, `registration-payment-eligibility.ts`) coi phí lúc đăng ký `<= 0` (kể cả rỗng) là đã đóng. Đăng ký miễn phí cũ, hoặc mọi đường ghi `isPaid=false` cho giải miễn phí, vì vậy bị loại khỏi sơ đồ dù chưa từng phải đóng phí. Trước change đó, loại trực tiếp nhận các đội này.

## What Changes

- Đội `COMPLETE` có `entryFeeAtRegistration` rỗng hoặc `<= 0` được coi là đã đóng phí khi vào sơ đồ, khớp `isRegistrationFeePaid`.
- Đội có phí `> 0`, chưa đóng, không được BTC miễn, không phải VĐV ảo vẫn bị loại.

## Capabilities

### Modified Capabilities

- `tournament-bracket-generation`: điều kiện đội hợp lệ thêm nhánh "miễn phí lúc đăng ký".

## Impact

- `src/modules/tournaments/utils/bracket-team-eligibility.ts`
- `src/modules/tournaments/tournament-bracket-doubles.spec.ts` (bộ parse SQL giả hỗ trợ `<=`; ca mới TC-BRK-FREE-01/02)
