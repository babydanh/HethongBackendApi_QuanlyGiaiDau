## 1. Bản đồ và AGENTS.md

- [x] 1.1 Viết `AGENTS.md` ở gốc repo, không quá 40 dòng. Xong khi: `wc -l AGENTS.md` cho số dòng ≤ 40 và mọi lệnh ghi trong file có exit code khớp `docs/README.md`.
- [x] 1.2 Viết `docs/README.md`: bảng câu hỏi → file, nhãn cho đủ 37 file `.md` theo dõi, mục DB, bảng lệnh. Xong khi: script kiểm độ phủ báo 0 file `.md` thiếu nhãn và 0 đường dẫn trong backtick không tồn tại (trừ dòng DB có chủ đích).

## 2. OpenSpec

- [x] 2.1 Chạy `openspec init --tools oh-my-pi --language vi --no-animation`; `openspec/config.yaml` có context Backend và rules; khối `operations:` giống hệt Web pilot. Xong khi: so sánh khối `operations:` với Web pilot không khác dòng nào và `openspec validate --all --strict` exit 0.
- [x] 2.2 Tạo change `agent-docs-map` với `skip_specs: true`. Xong khi: `openspec list` thấy change này và `openspec validate --all --strict` exit 0.

## 3. Kiểm chứng

- [x] 3.1 Chạy lại các lệnh đã ghi trong `docs/README.md`: `tsc --noEmit` exit 2 với đúng 12 lỗi trong `*.spec.ts`; `pnpm exec jest src/common/helpers/gender.helper.spec.ts` exit 0; `pnpm exec eslint src/common/helpers/gender.helper.ts` exit 0. Xong khi: số lỗi và exit code khớp bảng trong `docs/README.md`.
- [x] 3.2 Chạy `omp -p --no-session` trong worktree, không gọi tool: session liệt kê `AGENTS.md` của worktree trong các context file đã nạp. Xong khi: output có dòng `LOADED:` chứa đường dẫn `AGENTS.md` của worktree.
- [x] 3.3 Chạy `omp -p --no-session` hỏi 4 câu đặc thù repo (đọc bản đồ DB ở đâu; thêm bảng hoặc cột theo quy trình nào; contract endpoint ở đâu; ghi kế hoạch mới ở đâu). Xong khi: cả 4 câu trả lời đúng file theo `docs/README.md` và mỗi câu có dòng FILES_READ.
- [x] 3.4 Task cuối: chạy `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` và so với baseline 12 lỗi sẵn trong `*.spec.ts`. Xong khi: số lỗi vẫn là 12, tất cả nằm trong `*.spec.ts`, không tăng.

## Sau khi gộp (không theo dõi bằng checkbox)

- Gộp bằng `python C:/Users/GIGABYTE/.omp/scripts/merge-lane.py <worktree> --check "python C:/Users/GIGABYTE/.omp/scripts/openspec-gate.py"`. Agent không push `main`; người dùng tự xác nhận push.
- Archive sau khi người dùng duyệt kết quả: `openspec archive agent-docs-map --skip-specs`.
