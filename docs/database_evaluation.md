# 🔍 Đánh Giá Database Schema V3 — ACID, Toàn Vẹn & Pháp Lý

> Đánh giá chuyên sâu sau khi rà soát toàn bộ schema so với nghiệp vụ thực tế của một nền tảng thu tiền, quản lý giải đấu và xếp hạng.

---

## 🔴 7 Lỗ Hổng Đã Phát Hiện & Sửa

### 1. **Bảng `payments` dùng `ON DELETE CASCADE` — CỰC KỲ NGUY HIỂM**
- **Trước:** `user_id UUID REFERENCES users(id) ON DELETE CASCADE` + `tournament_id ... ON DELETE CASCADE`
- **Vấn đề:** Nếu admin vô tình xóa một user hoặc giải đấu, **toàn bộ lịch sử thanh toán sẽ bị xóa sạch**. Khi cần đối soát tài chính hoặc bị thanh tra thuế → mất sạch bằng chứng.
- **Đã sửa:** Đổi thành `ON DELETE RESTRICT`. Hệ thống sẽ từ chối xóa user/tournament nếu còn giao dịch liên quan. Muốn xóa → phải Soft Delete.

### 2. **Không có bảng lưu lịch sử thay đổi trạng thái thanh toán**
- **Trước:** Bảng `payments` chỉ có 1 cột `status`. Khi status thay đổi từ `PENDING → SUCCESSFUL`, giá trị cũ bị ghi đè mất.
- **Vấn đề pháp lý:** Nếu có tranh chấp (user nói "tôi đã nạp tiền rồi"), bạn không có bằng chứng cho thấy **ai đã đổi status, lúc nào, và vì lý do gì**.
- **Đã sửa:** Thêm bảng `payment_status_logs` — mỗi khi status thay đổi, insert 1 dòng mới ghi rõ: trạng thái cũ, trạng thái mới, người thực hiện, lý do, IP, thời gian.

### 3. **Không lưu bằng chứng đồng ý Điều khoản (Terms of Service)**
- **Trước:** Không có bảng nào ghi lại việc user đã đồng ý Điều khoản sử dụng.
- **Vấn đề pháp lý:** Theo luật GDPR/Bảo vệ dữ liệu cá nhân VN (Nghị định 13/2023), bạn phải **chứng minh** được rằng user đã đồng ý xử lý dữ liệu cá nhân của họ. Nếu user kiện "tôi không đồng ý cho bạn thu thập thông tin", mà bạn không có bằng chứng → bạn thua.
- **Đã sửa:** Thêm bảng `user_consents` — lưu loại consent, phiên bản điều khoản, IP, thời gian chấp nhận.

### 4. **Bảng `matches` thiếu ràng buộc CHECK quan trọng**
- **Trước:** Không có ràng buộc nào ngăn `participant1_id = participant2_id` (tự đánh với chính mình) hoặc `p1_sets_won < 0` (số set âm).
- **Đã sửa:** Thêm `CHECK (participant1_id IS DISTINCT FROM participant2_id)` và `CHECK (p1_sets_won >= 0)`.

### 5. **Không lưu vết ai xác nhận tỷ số cuối cùng**
- **Trước:** Bảng `matches` không ghi nhận ai là người nhấn nút "Xác nhận kết quả" cuối cùng.
- **Vấn đề:** Khi có khiếu nại về tỷ số sai, bạn không biết ai chịu trách nhiệm.
- **Đã sửa:** Thêm cột `score_confirmed_by` + `score_confirmed_at` vào bảng `matches`.

### 6. **Không có hệ thống khiếu nại (Disputes)**
- **Trước:** Không có bảng nào cho phép người chơi khiếu nại kết quả trận đấu.
- **Vấn đề:** Trong thể thao, tranh chấp kết quả là chuyện xảy ra thường xuyên. Không có cơ chế → user sẽ phàn nàn trên mạng xã hội → mất uy tín.
- **Đã sửa:** Thêm bảng `match_disputes` — người chơi submit khiếu nại kèm ảnh/video chứng cứ, Admin review và ra quyết định.

### 7. **Bảng `tournaments` thiếu thông tin quan trọng**
- **Trước:** Không có cột `created_by` (ai tạo giải), `start_date`, `end_date`, `venue_id`.
- **Vấn đề pháp lý:** Nếu giải đấu có vấn đề (ăn tiền bỏ trốn), bạn không biết chính xác ai đã tạo giải. Không có ngày tháng → không thể kiện.
- **Đã sửa:** Thêm `created_by` (RESTRICT), `start_date`, `end_date`, `venue_id`.

---

## 🟢 Tổng hợp các Bổ sung

### Bảng mới (3 bảng)
| Bảng | Mục đích |
|---|---|
| `payment_status_logs` | Lịch sử mọi thay đổi trạng thái thanh toán (đối soát tài chính) |
| `match_disputes` | Hệ thống khiếu nại kết quả trận đấu |
| `payout_status_logs` | Lịch sử thay đổi trạng thái lệnh rút tiền |

### Cột mới
| Bảng | Cột mới | Lý do |
|---|---|---|
| `users` | `is_email_verified` | Xác minh email (chống tạo tài khoản rác) |
| `user_to_roles` | `assigned_by` | Ai gán quyền |
| `profiles` | `date_of_birth` | Xác minh tuổi tham gia giải |
| `sessions` | `revoked_at` | Khi nào token bị thu hồi |
| `audit_logs` | `user_agent` | Thiết bị thực hiện hành động |
| `elo_history_logs` | `reason` | Lý do thay đổi ELO |
| `tournaments` | `created_by`, `start_date`, `end_date`, `venue_id` | Pháp lý + hiển thị |
| `tournament_participants` | `registered_by`, `registered_at` | Ai đăng ký, lúc nào |
| `payments` | `participant_id`, `platform_fee_amount`, `gateway_response`, `paid_at` | Đối soát chi tiết |
| `matches` | `score_confirmed_by/at`, `started_at`, `completed_at` | Lưu vết xác nhận |
| `organizer_payouts` | `total_collected`, `processed_at` | Đối soát số tiền |

### CHECK Constraints (9 ràng buộc mới)
| Bảng | Constraint | Ngăn chặn |
|---|---|---|
| `elo_tiers` | `min_elo < max_elo` | Nhập sai khoảng ELO |
| `user_ranks` | `elo_points >= 0` | ELO âm |
| `user_ranks` | `matches_won <= matches_played` | Thắng nhiều hơn số trận chơi |
| `tournaments` | `entry_fee >= 0` | Phí âm |
| `tournaments` | `platform_fee 0-100` | % hoa hồng vô lý |
| `payments` | `amount > 0` | Thanh toán số tiền 0 hoặc âm |
| `matches` | `p1/p2_sets_won >= 0` | Set âm |
| `matches` | `participant1 != participant2` | Tự đánh với mình |
| `friendships` | `sender != receiver` | Tự kết bạn |
| `advertisements` | `start < end date` | Ngày quảng cáo sai |
| `organizer_payouts` | `total >= amount + fee` | Rút nhiều hơn thu |

### Index mới cho truy vấn đối soát (7 index)
Đã bổ sung index cho các bảng `audit_logs`, `payments`, `payment_status_logs`, `match_disputes` để khi cần tra cứu pháp lý/đối soát sẽ query cực nhanh.

---

## 🎯 Kết luận

Schema V3 này đã đạt chuẩn **Production-grade** cho một nền tảng có thu tiền thật. Nó đảm bảo:
- ✅ **ACID:** CHECK constraints + ON DELETE RESTRICT cho mọi bảng tài chính.
- ✅ **Toàn vẹn:** Không có dữ liệu rác (dangling references), mọi FK đều rõ ràng.
- ✅ **Pháp lý:** Lưu vết AI LÀM GÌ, LÚC NÀO, Ở ĐÂU cho mọi hành động nhạy cảm (thanh toán, xác nhận kết quả, rút tiền, gán quyền).
- ✅ **Khiếu nại:** Có cơ chế dispute chính thức cho người chơi.
- ✅ **Quan hệ:** Xem chi tiết phân tích tại [database_relationships.md](./database_relationships.md).
