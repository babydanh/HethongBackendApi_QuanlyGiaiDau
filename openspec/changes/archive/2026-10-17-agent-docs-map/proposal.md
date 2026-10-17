## Why

Omp chỉ tự nạp `AGENTS.md` ở gốc repo git đang làm. Repo Backend chưa có `AGENTS.md`, chưa có bản đồ "câu hỏi → file", và mục Database Map (mục 11) ở `D:/Duancanhan/Project_QuanLyGiaiDau/AGENTS.md` trỏ tới `docs/schema/README.md` chưa có trên `origin/main`. 37 file `.md` theo dõi không có nhãn chuẩn / tham khảo / kế hoạch cũ; ví dụ `docs/database_schema.md` ghi 36 bảng trong khi code có 113 bảng `pgTable`, và `docs/rules.md` mục 1 bảo agent đọc file đó.

## What Changes

- Thêm `AGENTS.md` ở gốc repo (không quá 40 dòng): lệnh đã chạy thật, quy ước thật trong code, và đường dẫn tuyệt đối tới luật cấp dự án.
- Thêm `docs/README.md`: bảng "câu hỏi → file", nhãn cho đủ 37 file `.md` theo dõi trên `origin/main`, mục DB, bảng lệnh đã chạy kèm exit code, danh sách điều cần người dùng xem.
- Thêm `openspec/config.yaml` (context Backend, rules cho proposal/specs/tasks; khối `operations` giống Web pilot) và thư mục `.omp/` do `openspec init --tools oh-my-pi --language vi` tạo.
- Thêm change này (`skip_specs: true`) để ghi lại việc đã làm.

## Out of scope

- Không sửa code ứng dụng, `package.json`, CI (`.github/workflows/deploy.yml`), schema, migration hay `scripts/`.
- Không xóa, đổi tên hay di chuyển tài liệu cũ; chỉ ghi nhãn và ghi nhận lệch.
- Không viết lại `README.md` (hiện là mẫu NestJS) và không sửa nội dung các tài liệu lệch code.
- Không đưa bản đồ DB `docs/schema/*` vào change này: nó nằm ở 3 commit chưa push trên `main` cục bộ.
- Không chạy test cần PostgreSQL/Docker, E2E, build hay push.

## Impact

- Repo khác: không ảnh hưởng. Web Next.js và App Flutter không đổi endpoint, DTO hay field nào; không đụng `src/modules/*/*.controller.ts`.
- Runtime: không đổi hành vi backend. Chỉ thêm file tài liệu và cấu hình OpenSpec.
