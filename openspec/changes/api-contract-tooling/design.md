# Design

## Context

- `src/main.ts` tạo bản mô tả bằng `DocumentBuilder` + `SwaggerModule.createDocument(app, config)` và gắn vào `/api/docs` qua Scalar.
- `@nestjs/swagger` 11.4.4, Nest 11, build bằng `nest build` (`package.json`).
- `nest-cli.json` chưa có `plugins`.
- `TransformInterceptor` bọc mọi phản hồi thành `{statusCode, message, data, meta}`. Plugin không biết lớp bọc này, nên kiểu trả về mà plugin ghi là kiểu của `data`.
- `env.validation.ts` bắt buộc `DB_*`, `JWT_*`, `REDIS_HOST`.

## Goals / Non-Goals

**Goals:**
- Một lệnh xuất bản mô tả, không cần DB/Redis.
- CI báo đỏ khi API đổi theo kiểu phá vỡ, hoặc khi quên cập nhật `openapi.json`.

**Non-Goals:**
- Không bổ sung kiểu trả về cho route cũ.

## Decisions

- **Chế độ `preview` của Nest** (`NestFactory.create(AppModule, { preview: true })`):
  - dựng cây module và controller nhưng không khởi tạo provider, nên không kết nối DB/Redis;
  - `SwaggerModule.createDocument` chỉ cần metadata của controller.
  - Biến môi trường bắt buộc được điền giá trị giả ngay trong lệnh xuất (chỉ khi chưa có), để `ConfigModule` qua được bước kiểm.
  - *Phương án khác:* dựng app thật kèm DB như job fullstack thì chậm hơn nhiều; lấy `/api/docs` từ server đang chạy thì phải có server.
- **Lệnh xuất chạy trên bản build** (`dist/`), vì plugin chỉ áp lúc `nest build`. Thứ tự là `pnpm build`, rồi `pnpm openapi:export`.
- **Commit `openapi.json`**, khoá sắp xếp ổn định (JSON 2 dấu cách). Khi đó:
  - so với `main` chỉ cần đọc file từ `origin/main`, không phải build `main` lần thứ hai;
  - diff của file cho người đọc thấy API đổi gì.
- **`oasdiff breaking`** chạy bằng Docker image `tufin/oasdiff` trong CI. Không thêm package vào repo.
- **Plugin:** `introspectComments: true`, `classValidatorShim: true`, `skipAutoHttpCode: true`. `skipAutoHttpCode` để plugin không tự gắn `@HttpCode()`, tránh đổi mã trạng thái đang trả.

## Chưa chắc (xác minh trên CI ở task 2)

- Chế độ `preview` có đủ cho `SwaggerModule.createDocument` với mọi module hiện có không. Có module dùng `onModuleInit` hay import động thì có thể cần chỉnh.
- Plugin có làm `nest build` lỗi ở DTO nào không.

## Risks / Trade-offs

- [Plugin đổi bản mô tả rất nhiều ở lần đầu] → đó là mục đích. Lượt đầu chưa có `openapi.json` trên `main` nên bỏ qua bước so phá vỡ, chỉ sinh baseline.
- [Quên chạy `openapi:export`] → CI báo đỏ, kèm lệnh cần chạy.
