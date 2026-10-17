## ADDED Requirements

### Requirement: Người tạo giải CLB chỉ giữ quyền khi còn là thành viên hiệu lực
Với giải thuộc CLB (`communityId` có giá trị), quyền theo người tạo giải (`createdBy`) MUST chỉ có khi người đó còn là thành viên hiệu lực của CLB (status `JOINED` hoặc `ACTIVE`, mọi role). Người đã rời CLB hoặc có status khác MUST NOT giữ quyền đó, trên mọi thao tác quản lý giải CLB. Giải không thuộc CLB không áp dụng điều kiện này.

#### Scenario: Người tạo giải CLB đã rời CLB không cập nhật được giải
- **WHEN** người đã tạo giải CLB, nay không còn dòng thành viên của CLB, gọi `PATCH /api/v1/tournaments/:id`
- **THEN** phản hồi 403 và giải không đổi

#### Scenario: Người tạo giải CLB bị cấm không xuất bản được giải
- **WHEN** người đã tạo giải CLB, status `BANNED` trong CLB, gọi `POST /api/v1/tournaments/:id/publish`
- **THEN** phản hồi 403

#### Scenario: Người tạo giải CLB còn là thành viên mọi role vẫn quản lý
- **WHEN** người đã tạo giải CLB, status `JOINED` với role `MEMBER`, gọi `PATCH /api/v1/tournaments/:id`
- **THEN** quyền được chấp nhận và thao tác tiếp tục theo hành vi hiện có

#### Scenario: Người tạo giải không thuộc CLB vẫn quản lý được giải
- **WHEN** người tạo giải không thuộc CLB gọi `PATCH /api/v1/tournaments/:id`, dù không còn là thành viên CLB nào
- **THEN** quyền được chấp nhận và thao tác tiếp tục theo hành vi hiện có

#### Scenario: Đồng BTC không thuộc CLB vẫn giữ quyền trên giải CLB
- **WHEN** người là đồng BTC (CO_ORGANIZER) của giải CLB, không phải thành viên CLB, gọi `PATCH /api/v1/tournaments/:id`
- **THEN** quyền được chấp nhận và thao tác tiếp tục theo hành vi hiện có
