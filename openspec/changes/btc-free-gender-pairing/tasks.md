# Tasks

## 1. Backend

- [x] 1.1 Bỏ kiểm giới tính trong ghép cặp của BTC (`assertPairGender` ở `tournament-lite.repository.ts`, `assertPairGendersFitDivision` ở `tournament-import.repository.ts`); xong khi test ghép tay, ghép ngẫu nhiên và thêm cặp với cặp cùng giới ở nội dung nam nữ / tài khoản thiếu giới tính đều tạo được cặp
- [x] 1.2 Mục BTC nhập chỉ có VĐV 1 trong nội dung đôi được tính là một VĐV (`countParticipantMembers`, `resolveSingleMember`); xong khi unit test `doubles-pair-member` cho khách nhập Excel, mục có VĐV 2, mục một tài khoản pass
- [x] 1.3 Nhập Excel nội dung đôi: dòng chỉ có VĐV 1 duyệt luôn thì `PENDING_PARTNER`; xong khi test repository nhập roster pass
- [x] 1.4 Tạo giải nhanh không có nội dung và không chỉ định thể thức tạo "Đôi Linh Hoạt" (`DOUBLES`, không giới hạn giới tính); xong khi test tạo giải lite pass
- [x] 1.5 `npx jest src/modules/tournaments` và `tsc -p tsconfig.build.json` pass (16/10: jest tournaments 624/624, tsc sạch)
