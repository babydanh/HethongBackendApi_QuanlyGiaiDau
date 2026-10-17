# live-overlay-view-model Specification

## Purpose
View-model overlay (H2H và Bracket phủ lên video trận live) do Backend tính một lần, để Web và App hiển thị giống hệt nhau cho cả đơn lẫn đôi.

## Requirements

### Requirement: Endpoint trả view-model overlay cho một trận
Hệ thống SHALL cung cấp `GET /matches/:id/overlay`, công khai, áp dụng đúng kiểm tra quyền xem trận của `GET /matches/:id`. Phản hồi MUST theo định dạng chung (`data`, `message`, `statusCode`, `meta`) và `data` gồm `h2hVisible`, `bracketVisible`, `h2h`, `bracket`, `bracketReason`. Endpoint chỉ phục vụ trận thuộc giải đấu.

#### Scenario: Trận hợp lệ
- **WHEN** khách gọi `GET /matches/:id/overlay` với trận công khai có đủ hai bên
- **THEN** hệ thống trả 200, `h2hVisible` và `bracketVisible` bằng đúng `h2hOverlayVisible` và `bracketOverlayVisible` đã lưu, `h2h` khác null

#### Scenario: Trận không tồn tại hoặc không được xem
- **WHEN** `:id` không tồn tại, hoặc người gọi không có quyền xem trận riêng tư
- **THEN** hệ thống trả 404, không lộ việc trận có tồn tại hay không

#### Scenario: Trận chưa đủ hai bên
- **WHEN** trận mới có một bên hoặc chưa có bên nào
- **THEN** `h2h` là null, `bracketVisible` và `h2hVisible` vẫn trả theo cờ đã lưu, và trả 200

#### Scenario: Trận không thuộc giải đấu
- **WHEN** `:id` là trận CLB hoặc trận kèo (nằm ngoài bảng `matches`)
- **THEN** hệ thống trả 404; đây là giới hạn đã biết của change này

### Requirement: Tên hiển thị một bên
Hệ thống SHALL dựng `name` của mỗi bên: chuẩn hoá Unicode NFC và bỏ khoảng trắng thừa (kể cả NBSP); với 1 hoặc 2 thành viên thì nối tên gọi (từ cuối của họ tên) bằng " - ", và nếu hai tên gọi trùng nhau thì dùng 2 từ cuối cho cả hai; với 0 hoặc từ 3 thành viên thì dùng `teamName`. Khi nội dung là đôi nhưng mới có 1 thành viên, `note` MUST là "(chờ đồng đội)".

#### Scenario: Cặp đôi bình thường
- **WHEN** một bên có hai thành viên "Nguyễn Văn Danh" và "Trần Minh Luân"
- **THEN** `name` là "Danh - Luân" và `note` là null

#### Scenario: Hai tên gọi trùng nhau
- **WHEN** một bên có "Lê Thị Anh" và "Phạm Quốc Anh"
- **THEN** `name` là "Thị Anh - Quốc Anh"

#### Scenario: Đội từ ba người trở lên hoặc không có thành viên
- **WHEN** một bên là đội bóng có 11 thành viên, hoặc không có thành viên nào
- **THEN** `name` bằng `teamName` và `avatars` là danh sách rỗng

#### Scenario: Cặp mới chỉ có một người
- **WHEN** nội dung là đôi và người thứ hai chưa nhận lời
- **THEN** `name` là tên gọi của người đã có và `note` là "(chờ đồng đội)"

### Requirement: Thành viên được tính cho một bên
Khi dựng tên và avatar của một bên, hệ thống SHALL chỉ tính thành viên có roster ACTIVE và vai trò MAIN, sắp theo thời điểm vào đội.

#### Scenario: Thành viên dự bị hoặc đã bị loại
- **WHEN** một bên có hai thành viên ACTIVE MAIN và một thành viên RESERVE hoặc REMOVED
- **THEN** `name` chỉ ghép hai thành viên ACTIVE MAIN

### Requirement: Khối H2H
`h2h` SHALL gồm `title` luôn là "ĐỐI ĐẦU", `round`, `left` (bên 1) và `right` (bên 2); `round` là nhãn vòng tiếng Việt của trận hoặc null. H2H chỉ giới thiệu hai bên của trận hiện tại và MUST NOT chứa thành tích đối đầu, seed hay ELO.

#### Scenario: Chung kết loại trực tiếp
- **WHEN** trận chung kết của giải loại trực tiếp có đủ hai bên
- **THEN** `title` là "ĐỐI ĐẦU" và `round` là "CHUNG KẾT"

#### Scenario: Tranh hạng ba và vòng bảng
- **WHEN** trận thuộc nhánh THIRD_PLACE, hoặc thuộc vòng bảng
- **THEN** `round` lần lượt là "TRANH HẠNG BA" và "VÒNG BẢNG"

#### Scenario: Thể thức khác
- **WHEN** trận thuộc giải loại kép
- **THEN** `round` là null và `title` vẫn là "ĐỐI ĐẦU"

### Requirement: Avatar và dự phòng
Hệ thống SHALL trả cho mỗi bên danh sách `avatars` (0 đến 2 phần tử), mỗi phần tử gồm `url` (có thể null) và `initial` (chữ cái đầu của tên gọi, in hoa). Hệ thống MUST NOT trả email, số điện thoại, `userId`, ELO hoặc seed trong bất kỳ trường nào của phản hồi.

#### Scenario: Thành viên không có ảnh
- **WHEN** một thành viên chưa có `avatarUrl`
- **THEN** phần tử avatar có `url` null và `initial` đúng chữ cái đầu để client vẽ chữ

#### Scenario: Kiểm tra khoá bị cấm
- **WHEN** test duyệt đệ quy toàn bộ khoá của một phản hồi mẫu
- **THEN** không có khoá `email`, `phone`, `userId`, `elo`, `seed` ở bất kỳ cấp nào

### Requirement: Bracket tối đa bốn cột chứa trận đang xem
Hệ thống SHALL chỉ dựng `bracket` cho giải loại trực tiếp một nhánh, với `columns` gồm tối đa 4 vòng liên tiếp, luôn chứa vòng của trận `:id` và lệch về chung kết nhất có thể (công thức ở `design.md`, quyết định 4). Thẻ trận MUST NOT có mã trận và dòng của thẻ MUST NOT có seed. Tiêu đề cột MUST chỉ có tiếng Việt.

#### Scenario: Giải 16 cặp
- **WHEN** giải có 4 vòng và trận đang xem ở tứ kết
- **THEN** `columns` có 4 cột: "VÒNG 16", "TỨ KẾT", "BÁN KẾT", "CHUNG KẾT"

#### Scenario: Giải 8 cặp
- **WHEN** giải có 3 vòng
- **THEN** `columns` có 3 cột: "TỨ KẾT", "BÁN KẾT", "CHUNG KẾT"

#### Scenario: Nhãn cột theo khoảng cách tới chung kết
- **WHEN** một vòng cách chung kết 0, 1, 2, 3 hoặc 4 vòng
- **THEN** tiêu đề cột lần lượt là "CHUNG KẾT", "BÁN KẾT", "TỨ KẾT", "VÒNG 16", "VÒNG 32", không có tiếng Anh và không có mã trận (QF1, SF2…)

#### Scenario: Công thức cửa sổ
- **WHEN** giải có T vòng và trận `:id` ở vòng k (đánh số từ 1 ở vòng đầu; trận ngoài bracket dùng k = T)
- **THEN** cột cuối là end = min(T, k + 3), cột đầu là start = end - min(4, T) + 1, và `columns` gồm các vòng start đến end theo thứ tự trái sang phải

#### Scenario: Trận đang xem ở vòng sớm của giải lớn
- **WHEN** giải có 5 vòng (32 cặp) và trận đang xem ở vòng 1
- **THEN** cửa sổ là vòng 1 đến vòng 4 (end = 4, start = 1), có 4 cột bắt đầu bằng "VÒNG 32", và không có cột "CHUNG KẾT"

#### Scenario: Bảng ca đủ
- **WHEN** test duyệt mọi T từ 1 đến 6 và mọi k từ 1 đến T
- **THEN** cửa sổ luôn có độ dài min(4, T) và luôn chứa vòng k

#### Scenario: Định dạng chưa hỗ trợ
- **WHEN** giải là vòng bảng, loại kép hoặc không có nhánh loại trực tiếp
- **THEN** `bracket` là null, `bracketReason` là một câu tiếng Việt giải thích, và trả 200

### Requirement: Nổi bật trận đang xem
Hệ thống SHALL đặt `live = true` cho đúng một thẻ có `id` trùng `:id` (nếu trận có trong cửa sổ) và `litNext = true` cho mọi thẻ nằm trên đường từ thẻ đó theo `nextMatchId` tới chung kết (trừ thẻ chung kết); `nextId` MUST là id thẻ vòng sau nếu thẻ đó nằm trong cửa sổ, ngược lại null; thẻ chung kết MUST có `final = true`.

#### Scenario: Đường nổi bật
- **WHEN** trận đang xem là tứ kết số 2 của giải 16 cặp
- **THEN** thẻ đó có `live` true; thẻ bán kết tương ứng có `litNext` true; thẻ chung kết có `final` true và `litNext` false

#### Scenario: Trận không thuộc bracket
- **WHEN** `:id` là trận giao hữu không thuộc nhánh nào
- **THEN** không thẻ nào có `live` true và cửa sổ là 4 vòng cuối

### Requirement: Dòng của thẻ và điểm
Mỗi thẻ SHALL có đúng hai dòng. `name` là null khi chưa biết đội ("Chờ kết quả" do client vẽ), là "BYE" khi đội được miễn; `score` là số set thắng dạng chuỗi hoặc null khi chưa đấu; `won` là true chỉ khi trận đã có `winnerId` và dòng đó là bên thắng.

#### Scenario: Trận đã xong
- **WHEN** trận có `winnerId` là bên 1 và tỉ số set 2–1
- **THEN** dòng 1 có `score` "2" và `won` true; dòng 2 có `score` "1" và `won` false

#### Scenario: Trận chưa có đội
- **WHEN** vòng sau chưa biết người thắng của trận trước
- **THEN** dòng tương ứng có `name` null, `score` null, `won` false

#### Scenario: Điểm đang chơi
- **WHEN** trận đang diễn ra, chưa có `winnerId`
- **THEN** `score` là số set hiện tại và `won` false ở cả hai dòng

#### Scenario: Trận nhiều set
- **WHEN** trận bo 5 kết thúc với tỉ số set 3–1
- **THEN** `score` của hai dòng là "3" và "1", không bị giới hạn ở 2

### Requirement: Cache theo trận
Hệ thống SHALL cache phần nội dung (`h2h`, `bracket`, `bracketReason`) theo `:id` tối đa 3 giây; hai cờ `h2hVisible` và `bracketVisible` MUST luôn lấy mới; MUST NOT cache phản hồi lỗi 404.

#### Scenario: Hai lần gọi liên tiếp
- **WHEN** hai yêu cầu cùng trận đến trong cùng một cửa sổ cache
- **THEN** truy vấn dữ liệu bracket chỉ chạy một lần

#### Scenario: Điểm đổi
- **WHEN** điểm trận đổi và đã qua cửa sổ cache
- **THEN** lần gọi kế tiếp trả điểm mới

#### Scenario: Cờ hiện/ẩn đổi trong cửa sổ cache
- **WHEN** BTC bật overlay ngay sau lần gọi trước và yêu cầu mới đến trong 3 giây
- **THEN** phản hồi mới có cờ đúng trạng thái mới dù nội dung lấy từ cache
