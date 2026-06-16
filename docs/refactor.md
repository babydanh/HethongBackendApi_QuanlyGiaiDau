# Refactor Plan: Migrate `pg` (node-postgres) → `postgres` (postgres.js)

> Nghiên cứu: graphify query + grep toàn bộ src/  
> Ngày: 2026-06-18  
> Scope: Backend `backend-api_qlgiaidau`

---

## 🔍 Phạm vi ảnh hưởng (từ graphify + grep)

### Tổng kết số lượng

| Nhóm | Số file | Ghi chú |
|------|---------|---------|
| **Runtime src/** – typed `NodePgDatabase` | 20 file | repositories + services có inject db |
| **Tooling** – `migrate.ts`, `check_roles.ts`, `test-db.ts` | 3 file | Dùng raw `Pool` / `Client` từ `pg` |
| **`src/database/`** – `database.module.ts`, `run-migration.ts` | 2 file | Điểm khởi tạo kết nối |
| **Seeds** – `src/database/seeds/*.ts` | 6 file | Dùng `pg` Pool trực tiếp |
| **Scratch** – `scratch/*.ts` (generated, không maintain) | bỏ qua | Không cần migrate |

---

## 📌 Điểm chính cần hiểu trước khi code

### 1. `NodePgDatabase` vs `PostgresJsDatabase` — chỉ khác type, không khác logic query

Drizzle ORM trả về **type khác nhau** tùy driver:
```ts
// Hiện tại (node-postgres)
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
// Sau khi đổi (postgres.js)
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
```

**Query Drizzle không đổi.** Chỉ cần thay type trong constructor injection.

### 2. `Transaction` type alias — điểm rủi ro lớn nhất

Hiện tại nhiều file tự extract transaction type trực tiếp từ adapter:
```ts
// ❌ Hiện tại — gắn chặt với adapter node-postgres
export type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];
```

Sau refactor phải đổi thành:
```ts
// ✅ Sau — gắn với postgres.js adapter
export type Transaction = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];
```

**Giải pháp tốt hơn:** Tạo file `src/database/db.types.ts` với shared types, để các module import từ một nơi duy nhất.

### 3. `postgres.js` lifecycle khác `pg.Pool`

- `pg.Pool` — tạo pool, dùng `pool.connect()`, gọi `client.release()`, kết thúc với `pool.end()`
- `postgres.js` — tạo `sql` client, **tự pool nội bộ**, không cần `client.release()`; lifecycle: `sql.end()` khi app shutdown

### 4. Tên thuộc tính connection khác

| `pg` (cũ) | `postgres` (mới) |
|-----------|------------------|
| `user` | `username` |
| `Pool({ host, port, user, ... })` | `postgres({ host, port, username, ... })` |
| `ssl: { rejectUnauthorized: false }` | `ssl: 'prefer'` hoặc `{ rejectUnauthorized: false }` |

### 5. Raw SQL — khác syntax

```ts
// pg Pool
const client = await pool.connect();
await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
client.release();

// postgres.js
await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
```

### 6. `prepare: false` (tắt prepared statement cache)

Với `postgres.js`, tắt dễ hơn:
```ts
const sql = postgres({ ..., prepare: false });
```

Đây là lý do chính để chuyển sang `postgres.js` nếu muốn tắt prepared statement cache.

---

## 📂 Chi tiết từng file cần sửa

---

### BATCH 1 — Infrastructure (phải làm trước, unblocks tất cả)

#### [NEW] `src/database/db.types.ts`

```ts
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Shared DB type — dùng thay NodePgDatabase<typeof schema> ở mọi nơi
export type AppDb = PostgresJsDatabase<typeof schema>;

// Transaction type — dùng thay extract inline ở audit, rankings, tournaments
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

// Union: db hoặc transaction — cho các hàm có thể nhận cả hai
export type AppDbOrTx = AppDb | AppTx;
```

#### [MODIFY] `src/database/database.module.ts`

```ts
// Trước
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ host, port, user, password, database });
return drizzle(pool, { schema });

// Sau
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const sql = postgres({
  host: configService.get<string>('database.host'),
  port: configService.get<number>('database.port'),
  username: configService.get<string>('database.username'),  // ← đổi từ user → username
  password: configService.get<string>('database.password'),
  database: configService.get<string>('database.database'),
  prepare: false,          // tắt prepared statement cache
  max: 10,                 // pool size (mặc định postgres.js = 10)
  idle_timeout: 20,        // seconds
  connect_timeout: 10,
});
return drizzle(sql, { schema });
```

> **Shutdown hook**: Nest không tự gọi `sql.end()`. Cần thêm `onModuleDestroy`:
> ```ts
> async onModuleDestroy() { await sql.end(); }
> ```

---

### BATCH 2 — Shared Transaction Type (unblocks modules)

#### [MODIFY] `src/modules/audit/audit.service.ts` — điểm phát sinh `Transaction` type

```ts
// Trước (lines 3, 7)
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
export type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];
private readonly db: NodePgDatabase<typeof schema>

// Sau
import { AppDb, AppTx } from '../../database/db.types';
export type Transaction = AppTx;   // ← re-export để các module khác dùng tiếp
private readonly db: AppDb
```

> **Lưu ý:** `Transaction` type được re-export từ `audit.service.ts` và các module khác import từ đó. Sau khi tạo `db.types.ts`, có thể import trực tiếp từ `db.types.ts` thay vì qua `audit.service.ts`.

---

### BATCH 3 — Module Repositories & Services (20 file, pattern lặp lại)

Tất cả các file sau đều dùng cùng một pattern, chỉ thay 2 dòng:

**Dòng cần thay (mỗi file):**
```ts
// Trước
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
private readonly db: NodePgDatabase<typeof schema>

// Sau
import { AppDb } from '../../database/db.types';  // điều chỉnh relative path
private readonly db: AppDb
```

**Danh sách file (20 file):**

| File | Community | Có Transaction? |
|------|-----------|----------------|
| `src/modules/auth/auth.repository.ts` | 10 | Không |
| `src/modules/categories/categories.repository.ts` | 10 | Không |
| `src/modules/chat/chat.repository.ts` | 10 | Không |
| `src/modules/communities/challenges.repository.ts` | 10 | Không |
| `src/modules/communities/communities.repository.ts` | 10 | Không |
| `src/modules/matches/matches.repository.ts` | 7 | Không |
| `src/modules/notifications/notifications.repository.ts` | 10 | Không |
| `src/modules/payments/payments.repository.ts` | 10 | Không |
| `src/modules/rankings/rankings.repository.ts` | 38 | **Có** (L243, L316, L350, L374) |
| `src/modules/rankings/rankings.service.ts` | 38 | **Có** (L8, L10) |
| `src/modules/regions/regions.repository.ts` | 10 | Không |
| `src/modules/series/series.repository.ts` | 466 | Không |
| `src/modules/social/social.repository.ts` | 10 | Không |
| `src/modules/tournaments/tournaments.repository.ts` | 10 | **Có** (L23, L184) |
| `src/modules/tournaments/bracket-generator.service.ts` | 10 | Không |
| `src/modules/tournaments/tournament-scheduler.service.ts` | 10 | Không |
| `src/modules/users/users.repository.ts` | 11 | Không |
| `src/modules/venues/venues.repository.ts` | 4 | Không |
| `src/modules/admin/admin.service.ts` | 252 | Không |
| `src/modules/audit/audit.service.ts` | 19 | **Có** (L7, L12) |

**File có Transaction inline — cần dọn thêm:**

```ts
// ❌ Hiện tại trong rankings.repository.ts:L243, L316, L350, L374
tx: Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0>

// ✅ Sau khi có AppTx
tx: AppTx
```

---

### BATCH 4 — Tooling Scripts

#### [MODIFY] `migrate.ts`

```ts
// Trước
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const pool = new Pool({ ..., ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
client.release();
const db = drizzle(pool);
await migrate(db, { migrationsFolder: './src/database/migrations' });
pool.end();

// Sau
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// postgres.js tự quản lý connection, không cần connect/release
const sql = postgres({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,      // ← username, không phải user
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: 'prefer',
  max: 1,                                 // migration chỉ cần 1 connection
  onnotice: () => {},                     // tắt notice logs
});
// Raw SQL vẫn được với postgres.js
await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
const db = drizzle(sql);
await migrate(db, { migrationsFolder: './src/database/migrations' });
await sql.end();
```

#### [MODIFY] `src/database/run-migration.ts`

```ts
// Trước
import { Pool } from 'pg';
const pool = new Pool({ ... });
await pool.query(sql);
await pool.end();

// Sau
import postgres from 'postgres';
const sql = postgres({ username: ..., ... });
await sql.unsafe(migrationSql);  // unsafe() để chạy multi-statement SQL
await sql.end();
```

#### [MODIFY] `check_roles.ts`

```ts
// Trước
import { Pool } from 'pg';
const pool = new Pool({ ... });
const client = await pool.connect();
const res = await client.query('SELECT * FROM roles');
client.release();
pool.end();

// Sau
import postgres from 'postgres';
const sql = postgres({ username: ..., ... });
const rows = await sql`SELECT * FROM roles`;
console.log('Roles:', rows);
await sql.end();
```

#### [MODIFY] `test-db.ts`

```ts
// Trước: import { Client } from 'pg'; client.connect(); client.query(); client.end();

// Sau
import postgres from 'postgres';
const sql = postgres({ username: ..., ... });
try {
  const rows = await sql`SELECT NOW()`;
  console.log('Thời gian trên Server DB:', rows[0].now);
} catch (err: any) {
  console.error('Kết nối thất bại!', err.message);
} finally {
  await sql.end();
}
```

---

### BATCH 5 — Seeds (6 file, pattern giống nhau)

**Hiện tại:** Mỗi seed tự tạo `pg.Pool`, dùng raw `pool.query()`  
**Sau:** Dùng `postgres.js` client

Pattern thay cho mỗi seed:
```ts
// Trước (admin.seed.ts, categories.seed.ts, ...)
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
const pool = new Pool({ ... });
const db = drizzle(pool, { schema });
// ... seed logic
await pool.end();

// Sau
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
const sql = postgres({ username: ..., ... });
const db = drizzle(sql, { schema });
// ... seed logic (không đổi)
await sql.end();
```

---

## 🔄 Thứ tự thực hiện

```
BATCH 1: database.module.ts + db.types.ts  ← Unblocks tất cả
    ↓
BATCH 2: audit.service.ts (Transaction re-export)
    ↓
BATCH 3: 20 module repositories/services (có thể song song)
    ↓
BATCH 4: migrate.ts + run-migration.ts + check_roles.ts + test-db.ts
    ↓
BATCH 5: 6 seed files
    ↓
BATCH 6: pnpm remove pg @types/pg && pnpm add postgres
         Chạy pnpm build → kiểm tra lỗi TypeScript
```

> **Quan trọng:** Đổi dependency CUỐI CÙNG để không break dev server đang chạy.

---

## ⚠️ Rủi ro và lưu ý

### Rủi ro 1 — `Transaction` type rải rác

**Vị trí hot spots:**
- `audit.service.ts:7` — nguồn phát sinh, re-export cho module khác
- `rankings.repository.ts:243, 316, 350, 374` — inline type extraction
- `tournaments.repository.ts:184` — inline type extraction
- `rankings.service.ts:10` — inline type extraction

**Cách xử lý:** Dọn sạch bằng `AppTx` từ `db.types.ts`, không để inline.

### Rủi ro 2 — `postgres.js` không có `pool.end()` blocking

`postgres.js` dùng `sql.end({ timeout: 5 })` để graceful shutdown. Nếu không thêm `onModuleDestroy` trong `DatabaseModule`, khi Nest app shutdown, connection sẽ không được đóng sạch.

```ts
// Phải thêm trong DatabaseModule:
@Global()
@Module({ ... })
export class DatabaseModule implements OnModuleDestroy {
  private sql: ReturnType<typeof postgres>;
  
  async onModuleDestroy() {
    await this.sql.end({ timeout: 5 });
  }
}
```

### Rủi ro 3 — SSL trong production

`migrate.ts` hiện tại có `ssl: { rejectUnauthorized: false }` (Neon/Supabase).  
`postgres.js` dùng `ssl: 'prefer'` hoặc `ssl: true` hoặc `ssl: { rejectUnauthorized: false }` — cần test với môi trường deploy thật.

### Rủi ro 4 — `sql.unsafe()` cho multi-statement SQL

`run-migration.ts` hiện tại chạy file SQL chứa nhiều statement cùng lúc.  
`postgres.js` tagged template `sql` chỉ chạy 1 statement.  
→ Phải dùng `sql.unsafe(rawSqlString)` cho multi-statement.

### Rủi ro 5 — `drizzle.config.ts` (drizzle-kit)

```ts
// Kiểm tra drizzle.config.ts — nếu dùng dialect 'postgresql' thì không cần đổi
// drizzle-kit hỗ trợ cả hai driver, config không thay đổi
```

---

## ✅ Checklist Verify

```
[ ] pnpm build không có lỗi TypeScript
[ ] src/ không còn: `from 'pg'`, `NodePgDatabase`, `drizzle-orm/node-postgres`
[ ] app boot được qua DatabaseModule (pnpm start:dev)
[ ] Chạy được 1 read query: GET /tournaments
[ ] Chạy được 1 transaction path: POST /matches (rankings update)
[ ] migrate.ts chạy được: npx ts-node migrate.ts
[ ] check_roles.ts chạy được
[ ] Seeds chạy được
[ ] Không còn @types/pg trong package.json
[ ] ssl hoạt động với database production (nếu có)
```

---

## 📦 Dependency changes

```bash
# Thêm postgres.js
pnpm add postgres

# Xóa pg và types
pnpm remove pg @types/pg

# Verify
pnpm list postgres pg
```

---

## 📊 Tổng kết khối lượng

| Batch | File | Thay đổi chính | Độ phức tạp |
|-------|------|----------------|-------------|
| 1 – Core infra | 2 (+1 new) | Đổi provider, tạo shared types | ★★★ |
| 2 – audit.service | 1 | Đổi Transaction source | ★★☆ |
| 3 – Repositories/Services | 20 | Đổi type import (lặp lại) | ★★☆ |
| 4 – Tooling scripts | 4 | Đổi Pool → sql, raw query syntax | ★★☆ |
| 5 – Seeds | 6 | Đổi Pool → sql | ★☆☆ |
| **Tổng** | **~34 file** | **~130-150 dòng** | **~2-4 giờ** |

> Với IDE refactor (Find & Replace + TypeScript compiler error-follow), có thể hoàn thành trong 1-2 giờ.
