## Why

BTC báo 16–17/10: "tạo giải nhanh vào ra đánh đôi, chả ghép được gì", "không tạo được bracket đôi", "ghép ngẫu nhiên lỗi tùm lum". Audit luồng sơ đồ (local://flow-bracket.md, tái hiện bằng local://flow-bracket-audit.spec.ts) tìm ra các lỗi ở tầng tạo sơ đồ Backend:

- Tạo sơ đồ đôi của giải lite tự ghép ngẫu nhiên mọi VĐV đang chờ (`tournament-bracket.service.ts:419-429`) và nuốt lỗi bằng `catch` rỗng. BTC không chọn, không biết, không được báo người lẻ.
- Giải nhiều nội dung mà không truyền `divisionId` (và giải lite nhiều nội dung chọn `divisions[0]` ngầm) gộp VĐV của mọi nội dung vào một sơ đồ (test B1 đỏ).
- Cùng 4 cặp COMPLETE: SE nhận cả 4, nhưng GSK báo "Cần ít nhất 4 đội" vì chỉ đếm cặp đã đóng phí. Thông báo cho giải đôi nói "đội", không nói "cặp" (test A2, A3 đỏ).
- Khoá "đã chốt sơ đồ" vô hiệu từ UI: controller `allowReset ?? true` và web luôn gửi `allowReset: true` (test E1).
- Sơ đồ đôi hai lượt 4 đội chỉ còn 2 đội ở vòng 1: đảo `participant` của lượt về ghi đè cặp đã xếp (`bracket-generator.service.ts:266-280`, test D1 đỏ). Lượt về của cặp thật bị gán thành trận tự hoàn thành.
- Thể thức `GROUP_STAGE_THEN_KNOCKOUT` không có generator; service rơi âm thầm về loại trực tiếp (`tournament-bracket.service.ts:499-515`).
- Tạo sơ đồ không khoá cạnh tranh: hai request cùng lúc có thể cùng soft-delete rồi cùng insert, để lại hơn một stage active cho một nội dung.

Chốt nghiệp vụ (17/10, nguồn: ghi chú quyết định của chủ dự án):
- D2: giữ tự ghép ngẫu nhiên khi tạo sơ đồ đôi lite, nhưng chỉ ghép trong đúng nội dung, không nuốt lỗi thật, và trả về danh sách ai đã ghép với ai và người lẻ để UI hiển thị.
- D3: VĐV/đội do BTC thêm, ghép, nhập Excel được coi là đã đóng phí (`organizerWaivedFee=true`, `isPaid=true`).
- Điều kiện đội hợp lệ thống nhất cho mọi thể thức.

## What Changes

- **Tự ghép (D2):** bỏ `catch` rỗng. Tạo sơ đồ đôi lite gọi ghép ngẫu nhiên trong đúng nội dung được tạo. Chỉ bỏ qua đúng lỗi "không còn ai để ghép" (mã thông báo `LITE_NO_PAIRABLE_MESSAGE`); mọi lỗi khác được ném ra. Response thêm tuỳ chọn `autoPaired` và `unpairedNames`.
- **Chọn nội dung (B3):** giải có nhiều hơn một nội dung mà thiếu `divisionId` → 400 "Vui lòng chọn nội dung để tạo sơ đồ." ở cả route `generate-bracket` và `lite/:id/bracket`. Giải một nội dung thiếu `divisionId` → dùng nội dung đó. Bỏ nhánh lite `divisions[0]`.
- **Điều kiện đội (B5/D3):** một hàm dùng chung cho SE, DE, RR, GSK và xếp hạt giống: `teamStatus = COMPLETE` AND (`isPaid` OR `organizerWaivedFee` OR `isMock`). Đôi phải có đủ 2 VĐV. Mức tối thiểu số đội/cặp nằm trong một bảng hằng số. Thông báo nói "cặp" cho nội dung đôi, "đội" cho đơn.
- **Tạo lại (B6):** controller `allowReset ?? false`. Sơ đồ đã có trận bắt đầu hoặc COMPLETED không tạo lại được, kể cả khi `allowReset=true`. Tạo sơ đồ khoá hàng giải (`SELECT ... FOR UPDATE`) trong transaction generator, và kiểm tra trận đã bắt đầu trong cùng transaction đó.
- **Hai lượt (B7):** xếp cặp vòng 1 theo tie (2 trận/tie), lượt về đảo vai trong đúng tie; lượt về của tie có hai đội không tự COMPLETED.
- **Thể thức lạ:** `GROUP_STAGE_THEN_KNOCKOUT` và mọi `bracketType` không nhận diện → 400 rõ ràng, không rơi về loại trực tiếp.
- **Chốt giải (lock):** closure `tournaments.service.ts:1750` tạo sơ đồ theo từng nội dung khi giải có nhiều nội dung (thay vì gọi không `divisionId`, sẽ bị 400 sau thay đổi).

## Impact

- Backend (lane này): `services/tournament-bracket.service.ts`, `bracket-generator.service.ts`, `repositories/tournament-bracket.repository.ts`, `utils/` (hàm đội hợp lệ), `tournaments.controller.ts` (một dòng `allowReset`), `tournaments.service.ts` (closure lock), `services/tournament-lite.service.ts` (`generateLiteBracket` truyền `reset` thay vì ép `true`, bỏ kiểm trận bắt đầu trùng), và các spec liên quan.
- Backend (lane BePairing, phụ thuộc): `repositories/tournament-lite.repository.ts` `generateLitePairsTx` nhận `divisionId?`, trả `memberNames` và `unpairedNames`, export `LITE_NO_PAIRABLE_MESSAGE`. Gộp BePairing trước.
- API: không đổi route. Response tạo sơ đồ thêm tuỳ chọn `autoPaired`, `unpairedNames`. Thêm 400 mới (chọn nội dung, thể thức chưa hỗ trợ). Client phải chịu được thiếu trường.
- **Đổi hành vi có ý thức:** giải không phải bóng đá, thể thức SE/DE/RR từng nhận đội COMPLETE chưa đóng phí; sau thay đổi các đội đó không vào sơ đồ, cùng quy tắc với GSK và bóng đá. Đăng ký miễn phí không ảnh hưởng (đã có `isPaid=true`).
- Không đổi schema, không migration.

## Ngoài phạm vi

- Tên nội dung mặc định khi tạo giải nhanh ("Đôi linh hoạt", đã chốt 17/10): lane khác.
- Web/App gọi sai route, App `createBatch` (F-01, F-04), UI phân bảng (F-08): lane Web/App.
- Ghép cặp, tách cặp, tiền của người thứ hai (F4), cặp khách (F5): lane BePairing.
- Giới tính: không kiểm ở bất kỳ đường BTC nào (đã chốt ở `organizer-guest-doubles-pairing`).
