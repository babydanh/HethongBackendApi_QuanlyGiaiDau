## Why

Chủ dự án báo 16/10: BTC không ghép được cặp có VĐV khách, ghép ngẫu nhiên "lỗi tùm lum", không tạo được bracket đôi, và giải tạo nhanh lại ra sẵn nội dung "Đánh Đôi". Audit 16/10 tìm ra:

- Ghép cặp của BTC (ghép tay, ghép ngẫu nhiên, thêm cặp) vẫn kiểm giới tính tài khoản (`assertPairGender`, `assertPairGendersFitDivision`). Ghép ngẫu nhiên chỉ cần một cặp ngẫu nhiên sai giới tính, hoặc một tài khoản chưa khai giới tính, là cả lượt ghép (một transaction) bị huỷ.
- Nhập Excel vào nội dung đôi, dòng chỉ có VĐV 1 được lưu thành đội `COMPLETE` một người: không vào hàng chờ ghép, và bracket được tạo với đội một người.
- Tạo giải nhanh không gửi `format`; nội dung mặc định lấy `dto.format` chưa chuẩn hoá nên rơi vào nhánh đôi ("Đánh Đôi"/"Đôi Nam", giới hạn giới tính theo giải).

Chủ dự án chốt 16/10: mọi thao tác của BTC không kiểm giới tính; dòng Excel đôi thiếu VĐV 2 vào hàng chờ BTC ghép; tạo giải nhanh mặc định "Đôi Linh Hoạt".

## What Changes

- Bỏ kiểm giới tính trong mọi đường ghép cặp của BTC (ghép tay, ghép nhiều cặp, ghép ngẫu nhiên, thêm cặp VĐV). VĐV tự đăng ký và đồng đội xác nhận lời mời vẫn kiểm như cũ.
- Mục BTC nhập (Excel, AI Excel, email thủ công, Google Form) giữ một người trong nội dung đôi được coi là một VĐV chờ ghép: nhập xong là `PENDING_PARTNER` (khi được duyệt luôn), vào hàng chờ BTC ghép, ghép tay/ngẫu nhiên và tách cặp như khách BTC thêm tay.
- Tạo giải nhanh không kèm nội dung và không chỉ định thể thức: tạo một nội dung "Đôi Linh Hoạt" (đôi, không giới hạn giới tính).

## Impact

- Backend: `utils/doubles-pair-member.ts`, `repositories/tournament-lite.repository.ts`, `repositories/tournament-import.repository.ts`, `services/tournament-lite.service.ts` và test đi kèm.
- Web (change cùng tên trong repo Web): hàng chờ BTC ghép nhận khách nhập Excel.
- Không đổi schema, không đổi hợp đồng API (cùng trường, cùng trạng thái).
