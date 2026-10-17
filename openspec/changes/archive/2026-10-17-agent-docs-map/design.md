## Context

- Gốc repo Backend là worktree `agent-standard`, tạo từ `origin/main` (commit 40ccd95). Không dùng `main` cục bộ vì 3 commit bản đồ DB (fb283ee, 67333f5, 2a4faa4) chưa push.
- Luật cấp dự án `D:/Duancanhan/Project_QuanLyGiaiDau/AGENTS.md` không được omp tự nạp. Mục 11 của nó nói về bản đồ DB; mục 10 nói về đồng bộ API client.
- Web pilot (`HethongFrontEndWeb_QLgiaidau.worktrees/openspec-pilot`) là mẫu cho cấu trúc AGENTS.md, docs/README.md và config.yaml.

## Goals / Non-Goals

- Goals: agent đọc `AGENTS.md` là biết đi đâu; mỗi file `.md` theo dõi có một nhãn; lệnh trong tài liệu đều đã chạy thật.
- Non-Goals: không sửa tài liệu lệch code; không chạy kiểm tra cần DB; không tạo bản đồ DB.

## Decisions

1. Đường dẫn tới luật cấp dự án dùng tuyệt đối `D:/Duancanhan/Project_QuanLyGiaiDau/AGENTS.md`, không dùng `../`. Từ worktree `../` trỏ vào thư mục `.worktrees/`.
2. Nhãn dùng ba mức như Web pilot: chuẩn (làm theo), tham khảo (đối chiếu code), kế hoạch cũ (không phải mô tả hệ thống). Khi hai nguồn chuẩn mâu thuẫn thì `INSTRUCTIONS.md` thắng.
3. Danh sách file lấy từ `git ls-files '*.md'` trên `origin/main`: 37 file. Thư mục `openspec/` và `.omp/` không nằm trong danh sách.
4. Dòng DB trong `docs/README.md` ghi rõ bản đồ `docs/schema/` chưa có trên `origin/main`; khi gộp thì thay bằng link.
5. Mỗi lệnh trong `docs/README.md` ghi exit code thật. Lệnh chưa chạy được ghi là chưa chạy, không ghi là đã qua.
6. Deploy không đổi: `deploy.yml` chạy khi push `main`. Agent không push.

## Risks / Trade-offs

- Nhãn là phán đoán dựa trên tên, mục lục và đối chiếu một vài điểm trong code; không phải kiểm chứng từng câu. `ripwire doc_drift` chỉ kiểm được một phần anchor và không kết luận tài liệu sai.
- Migration cũ có chạy lại từ rỗng được không chưa kiểm chứng (cần PostgreSQL). Tài liệu ghi chú điều này là chưa xác minh.
