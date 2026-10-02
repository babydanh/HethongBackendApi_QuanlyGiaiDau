# 🔐 Kế hoạch triển khai OAuth 2.0 — Multi-Provider Authentication

> **Mục tiêu:** Cho phép user đăng nhập bằng nhiều nhà cung cấp (Google, Facebook, GitHub...) bên cạnh đăng nhập bằng Email/Password truyền thống.
> **Trạng thái:** 📋 Plan — Chờ triển khai

---

## 1. Tổng quan kiến trúc

### Hiện tại (Email/Password only)
```
Client → POST /auth/login (email + password)
       → Backend xác minh password
       → Trả về JWT (access + refresh token)
```

### Sau khi thêm OAuth 2.0
```
Client → Redirect sang Google/Facebook
       → User đăng nhập bên provider
       → Provider redirect về Backend kèm authorization code
       → Backend đổi code lấy access_token từ provider
       → Backend lấy thông tin user (email, tên, avatar) từ provider
       → Backend tìm hoặc tạo user trong DB
       → Backend liên kết provider vào bảng auth_providers
       → Trả về JWT (access + refresh token) giống luồng đăng nhập thường
```

### Nguyên tắc quan trọng
- Một user có thể liên kết **nhiều provider** (Google + Facebook + Email/Password).
- Nếu email từ Google trùng email đã đăng ký bằng password → **liên kết tự động** (không tạo tài khoản mới).
- Password trong bảng `users` cho phép `NULL` (vì user đăng ký qua Google sẽ không có password).
- Hệ thống JWT hiện tại **không đổi** — OAuth chỉ là "cửa vào" thay thế cho email/password.

---

## 2. Thiết kế Database — Bảng `auth_providers`

### SQL
```sql
CREATE TABLE auth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    provider VARCHAR(50) NOT NULL,          -- 'GOOGLE', 'FACEBOOK', 'GITHUB'
    provider_user_id VARCHAR(255) NOT NULL,  -- ID của user bên provider (ví dụ: Google sub)
    provider_email VARCHAR(255),             -- Email từ provider (có thể khác email chính)
    provider_avatar_url TEXT,                -- Avatar từ provider
    provider_display_name VARCHAR(255),      -- Tên hiển thị từ provider
    access_token TEXT,                       -- Access token từ provider (nếu cần gọi API bên provider)
    refresh_token TEXT,                      -- Refresh token từ provider (nếu provider hỗ trợ)
    token_expires_at TIMESTAMP WITH TIME ZONE,  -- Thời gian hết hạn token provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT provider_user_unique UNIQUE (provider, provider_user_id)  -- Mỗi tài khoản provider chỉ liên kết 1 lần
);

CREATE INDEX idx_auth_providers_user ON auth_providers(user_id);
CREATE INDEX idx_auth_providers_lookup ON auth_providers(provider, provider_user_id);
```

### Drizzle ORM Schema (TypeScript)
```typescript
// Thêm vào file: src/database/schema/users.schema.ts

export const authProviders = pgTable('auth_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  providerAvatarUrl: text('provider_avatar_url'),
  providerDisplayName: varchar('provider_display_name', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

### Thay đổi bảng `users` hiện tại
```diff
 export const users = pgTable('users', {
   id: uuid('id').primaryKey().defaultRandom(),
   email: varchar('email', { length: 255 }).notNull().unique(),
-  passwordHash: text('password_hash').notNull(),
+  passwordHash: text('password_hash'),  // NULL nếu user đăng ký qua OAuth
   isEmailVerified: boolean('is_email_verified').default(false).notNull(),
   ...
 });
```

> **Lưu ý:** `passwordHash` cho phép NULL vì user đăng nhập bằng Google sẽ không bao giờ tạo mật khẩu. Luồng login bằng email/password cần kiểm tra `passwordHash !== null` trước khi so sánh bcrypt.

---

## 3. Luồng xử lý chi tiết

### 3.1. Luồng đăng nhập bằng Google (Authorization Code Flow)

```
Bước 1: Client gọi GET /auth/google
        → Backend redirect sang Google OAuth consent screen

Bước 2: User đăng nhập Google, đồng ý chia sẻ thông tin
        → Google redirect về GET /auth/google/callback?code=xxx

Bước 3: Backend nhận code, gọi Google API đổi lấy access_token
        → Backend dùng access_token lấy profile user (email, name, avatar, Google ID)

Bước 4: Backend tìm trong bảng auth_providers:
        → Nếu đã có record (provider='GOOGLE', provider_user_id=googleId):
           • Lấy user_id → sinh JWT → trả về client
        → Nếu chưa có:
           • Tìm user theo email trong bảng users:
             - Nếu email đã tồn tại → liên kết provider mới vào user đó
             - Nếu email chưa tồn tại → tạo user mới (passwordHash=NULL, isEmailVerified=true)
           • Insert record mới vào auth_providers
           • Sinh JWT → trả về client

Bước 5: Client nhận JWT, redirect về trang chủ
```

### 3.2. Luồng liên kết thêm provider (đã đăng nhập)

```
User đã đăng nhập bằng email/password, muốn liên kết thêm Google:

Bước 1: Client gọi GET /auth/google/link (kèm JWT hiện tại)
Bước 2: Redirect Google → callback
Bước 3: Backend kiểm tra Google ID chưa được liên kết bởi user khác
Bước 4: Insert vào auth_providers với user_id của user đang đăng nhập
Bước 5: Trả về success
```

### 3.3. Luồng hủy liên kết provider

```
User muốn hủy liên kết Google:

Bước 1: Client gọi DELETE /auth/providers/:providerId
Bước 2: Backend kiểm tra user còn ít nhất 1 phương thức đăng nhập khác
         (còn password HOẶC còn provider khác)
Bước 3: Nếu OK → xóa record khỏi auth_providers
Bước 4: Nếu đây là phương thức cuối cùng → từ chối (BadRequest)
```

---

## 4. API Endpoints

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET` | `/auth/google` | Public | Redirect sang Google OAuth |
| `GET` | `/auth/google/callback` | Public | Google redirect về đây sau khi user đồng ý |
| `GET` | `/auth/facebook` | Public | Redirect sang Facebook OAuth |
| `GET` | `/auth/facebook/callback` | Public | Facebook redirect về đây |
| `GET` | `/auth/providers` | JWT | Lấy danh sách provider đã liên kết của user |
| `GET` | `/auth/google/link` | JWT | Liên kết thêm Google vào tài khoản hiện tại |
| `DELETE` | `/auth/providers/:id` | JWT | Hủy liên kết một provider |

---

## 5. Cấu trúc file cần tạo / sửa

### File mới
```
src/modules/auth/
├── strategies/
│   ├── jwt.strategy.ts            (ĐÃ CÓ)
│   ├── google.strategy.ts         (MỚI) — Passport Google OAuth2 Strategy
│   └── facebook.strategy.ts       (MỚI) — Passport Facebook Strategy
├── guards/
│   └── google-auth.guard.ts       (MỚI) — Guard cho route Google OAuth
├── dto/
│   ├── register.dto.ts            (ĐÃ CÓ)
│   ├── login.dto.ts               (ĐÃ CÓ)
│   └── oauth-profile.dto.ts       (MỚI) — Interface cho profile từ provider
├── auth.controller.ts             (SỬA) — Thêm routes OAuth
├── auth.service.ts                (SỬA) — Thêm logic xử lý OAuth
├── auth.repository.ts             (SỬA) — Thêm hàm query auth_providers
└── auth.module.ts                 (SỬA) — Đăng ký strategies mới
```

### File schema
```
src/database/schema/
└── users.schema.ts                (SỬA) — Thêm bảng authProviders, sửa passwordHash nullable
```

### Config
```
src/config/
└── auth.config.ts                 (SỬA) — Thêm biến GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET...
```

### Environment Variables cần thêm
```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/api/v1/auth/facebook/callback
```

---

## 6. Dependencies cần cài

```bash
pnpm add passport-google-oauth20
pnpm add -D @types/passport-google-oauth20

# Nếu cần Facebook:
pnpm add passport-facebook
pnpm add -D @types/passport-facebook
```

> `@nestjs/passport` và `passport` đã được cài sẵn trong dự án.

---

## 7. Code mẫu — Google Strategy

```typescript
// src/modules/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.googleClientId')!,
      clientSecret: configService.get<string>('auth.googleClientSecret')!,
      callbackURL: configService.get<string>('auth.googleCallbackUrl')!,
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const oauthProfile = {
      provider: 'GOOGLE',
      providerUserId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
    };
    done(null, oauthProfile);
  }
}
```

---

## 8. Code mẫu — Controller (routes OAuth)

```typescript
// Thêm vào auth.controller.ts

@Public()
@Get('google')
@UseGuards(AuthGuard('google'))
@ApiOperation({ summary: 'Đăng nhập bằng Google' })
googleAuth() {
  // Guard sẽ tự redirect sang Google
}

@Public()
@Get('google/callback')
@UseGuards(AuthGuard('google'))
@ApiOperation({ summary: 'Google OAuth callback' })
async googleCallback(@Req() req: Request, @Res() res: Response) {
  const tokens = await this.authService.oauthLogin(
    req.user,              // Profile từ GoogleStrategy.validate()
    req.headers['user-agent'],
    req.ip,
  );
  // Redirect về frontend kèm tokens
  res.redirect(
    `${FRONTEND_URL}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
  );
}
```

---

## 9. Code mẫu — Service (logic OAuth)

```typescript
// Thêm vào auth.service.ts

async oauthLogin(
  oauthProfile: OAuthProfileDto,
  userAgent?: string,
  ipAddress?: string,
) {
  // 1. Tìm provider đã liên kết chưa
  const existingProvider = await this.authRepository.findAuthProvider(
    oauthProfile.provider,
    oauthProfile.providerUserId,
  );

  if (existingProvider) {
    // Đã liên kết → đăng nhập luôn
    const roles = await this.authRepository.findUserRoles(existingProvider.userId);
    return this.generateTokens(
      existingProvider.userId,
      oauthProfile.email!,
      roles,
      userAgent,
      ipAddress,
    );
  }

  // 2. Chưa liên kết → tìm user theo email
  let user = oauthProfile.email
    ? await this.authRepository.findUserByEmail(oauthProfile.email)
    : null;

  if (!user) {
    // 3. Chưa có user → tạo mới (không có password)
    user = await this.authRepository.createOAuthUser(
      { email: oauthProfile.email!, passwordHash: null },
      { fullName: oauthProfile.displayName || 'User', userId: '' },
    );
  }

  // 4. Liên kết provider
  await this.authRepository.createAuthProvider({
    userId: user.id,
    provider: oauthProfile.provider,
    providerUserId: oauthProfile.providerUserId,
    providerEmail: oauthProfile.email,
    providerAvatarUrl: oauthProfile.avatarUrl,
    providerDisplayName: oauthProfile.displayName,
    accessToken: oauthProfile.accessToken,
    refreshToken: oauthProfile.refreshToken,
  });

  // 5. Sinh JWT
  const roles = await this.authRepository.findUserRoles(user.id);
  return this.generateTokens(user.id, user.email, roles, userAgent, ipAddress);
}
```

---

## 10. Checklist triển khai

### Bước 1: Database
- [ ] Sửa `passwordHash` trong bảng `users` cho phép NULL.
- [ ] Thêm bảng `authProviders` vào `users.schema.ts`.
- [ ] Export trong `schema/index.ts`.
- [ ] Chạy `pnpm drizzle-kit generate` → tạo migration.
- [ ] Chạy `pnpm drizzle-kit migrate` → áp dụng migration.

### Bước 2: Config
- [ ] Thêm biến môi trường Google OAuth vào `.env` và `.env.example`.
- [ ] Cập nhật `auth.config.ts` thêm các key mới.
- [ ] Cập nhật environment validation (nếu có).

### Bước 3: Auth Module
- [ ] Cài dependencies: `passport-google-oauth20`, `@types/passport-google-oauth20`.
- [ ] Tạo `google.strategy.ts`.
- [ ] Tạo `google-auth.guard.ts`.
- [ ] Tạo `oauth-profile.dto.ts` (interface chung cho profile từ bất kỳ provider).
- [ ] Đăng ký `GoogleStrategy` trong `auth.module.ts`.

### Bước 4: Repository
- [ ] Thêm hàm `findAuthProvider(provider, providerUserId)` vào `auth.repository.ts`.
- [ ] Thêm hàm `createAuthProvider(data)`.
- [ ] Thêm hàm `findAuthProvidersByUserId(userId)`.
- [ ] Thêm hàm `deleteAuthProvider(id, userId)`.
- [ ] Thêm hàm `createOAuthUser(userData, profileData)` (không yêu cầu password).

### Bước 5: Service
- [ ] Thêm method `oauthLogin()` vào `auth.service.ts`.
- [ ] Thêm method `linkProvider()` — liên kết thêm provider cho user đã đăng nhập.
- [ ] Thêm method `unlinkProvider()` — hủy liên kết (phải kiểm tra còn ít nhất 1 cách đăng nhập).
- [ ] Thêm method `getLinkedProviders()`.
- [ ] Sửa method `login()` — kiểm tra `passwordHash !== null` trước khi bcrypt.compare.

### Bước 6: Controller
- [ ] Thêm route `GET /auth/google` + `GET /auth/google/callback`.
- [ ] Thêm route `GET /auth/providers` (lấy danh sách provider đã liên kết).
- [ ] Thêm route `GET /auth/google/link` (liên kết thêm).
- [ ] Thêm route `DELETE /auth/providers/:id` (hủy liên kết).

### Bước 7: Verification
- [ ] Build thành công (`pnpm build`).
- [ ] Lint pass (`pnpm lint`).
- [ ] Test luồng đăng nhập Google trên Postman/Browser.
- [ ] Test liên kết / hủy liên kết provider.
- [ ] Test edge case: email trùng, hủy provider cuối cùng.

---

## 11. Lưu ý bảo mật

1. **Không lưu access_token của provider** nếu không cần gọi API bên provider. Nếu chỉ cần đăng nhập thì có thể để NULL.
2. **Luôn kiểm tra email verified** từ phía provider trước khi tự động liên kết theo email.
3. **CSRF protection**: Dùng `state` parameter khi redirect sang provider.
4. **Redirect URL**: Chỉ cho phép redirect về domain frontend đã whitelist, tránh open redirect attack.
5. **Không truyền JWT qua URL** trên production — nên dùng HTTP-only cookie hoặc short-lived authorization code.
