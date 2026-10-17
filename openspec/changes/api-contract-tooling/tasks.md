# Tasks

## 1. Code Backend

- [ ] 1.1 `nest-cli.json` bật plugin `@nestjs/swagger` (`introspectComments`, `classValidatorShim`, `skipAutoHttpCode`). Xong khi: `pnpm build` xanh trên CI.
- [ ] 1.2 `src/openapi/openapi-document.ts`: hàm `createOpenApiDocument(app)` dùng chung; `src/main.ts` gọi hàm này, `/api/docs` giữ nguyên. Xong khi: `tsc --noEmit` không lỗi mới.
- [ ] 1.3 `src/openapi/export-openapi.ts` + script `openapi:export`: chế độ preview, điền env giả khi thiếu, ghi `openapi.json` ổn định. Xong khi: chạy trên CI ra file có hơn 400 path.

## 2. CI (repo agent-orchestrator) và script máy

- [ ] 2.1 Job `test-api-contract` (target `api-contract`): build → export → so `openapi.json` đã commit (lệch thì đỏ) → `oasdiff breaking` so với `origin/main:openapi.json` (chưa có thì bỏ qua) → upload artifact `openapi-spec`. Xong khi: có run id.
- [ ] 2.2 `cloud-test-runner.py`: thêm target `api-contract`. Skill `cloud-test-runner` ghi cách dùng. Xong khi: dispatch được.
- [ ] 2.3 Commit `openapi.json` sinh từ CI làm baseline. Xong khi: lượt `api-contract` kế tiếp xanh.

## 3. Tài liệu

- [ ] 3.1 `AGENTS.md`: luật API mới (DTO `*.dto.ts`, kiểu trả về class, chạy `openapi:export`). `docs/README.md`: lệnh mới và kết quả thật. Xong khi: có run id trong tài liệu.

## 4. Kiểm cuối

- [ ] 4.1 `pnpm test` liên quan và `pnpm build` xanh trên CI (target `backend`). Xong khi: có run id.
