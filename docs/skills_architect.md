# Architect Skills

# 🛠️ 8 Kỹ Năng Cốt Lõi (Tech Skills Map)

> Tài liệu này quy định **chính xác** 8 nhóm kỹ năng cần thiết để xây dựng dự án.  
> Mỗi kỹ năng được **map trực tiếp** với nghiệp vụ thực tế từ `database_schema.md`, `plan.md`, `apicrud.md`.  
> **AI Agent hoặc thành viên mới:** Hãy đọc file này TRƯỚC KHI viết bất kỳ dòng code nào.

---


## Skill 8: DevOps & Infrastructure — Docker + CI/CD + Cloud ☁️

> **Vận hành.** Đóng gói, triển khai, monitoring. Không có DevOps = không ship được sản phẩm.

| Công nghệ | Vai trò trong dự án |
|---|---|
| **Docker** + **Docker Compose** | Container hóa: PostgreSQL + PostGIS + Redis + NestJS API |
| **pnpm** | Package manager (nhanh, tiết kiệm disk so với npm) |
| **ESLint** + **Prettier** | Linting & Format — config mặc định NestJS |
| **Git** + **GitHub** | Version control, branching model (main/develop/feature/*) |
| **GitHub Actions** | CI/CD: Lint → Test → Build → Deploy tự động |
| **Redis** (>= 7.x) | Cache Leaderboard, Live Score, Session store |
| **Cloudinary** hoặc **AWS S3** | Lưu ảnh: avatar, banner, match evidence, transaction proof |
| **pgAdmin** | GUI quản lý PostgreSQL |
| **Postman** / **Insomnia** | Test API thủ công, tạo Collection |
| **PM2** | Process manager cho production Node.js |

### Phải biết gì?
- **Docker Compose stack**:
  ```yaml
  services:
    postgres:    # PostgreSQL 16 + PostGIS extension
    redis:       # Redis 7 cho caching
    api:         # NestJS app (depends on postgres, redis)
    pgadmin:     # GUI quản lý DB (dev only)
  ```
- **CI/CD Pipeline** (GitHub Actions):
  1. `pnpm lint` — Check ESLint
  2. `pnpm test` — Unit tests
  3. `pnpm build` — TypeScript compile
  4. Deploy to staging/production
- **Redis Caching**: Cache Leaderboard (TTL 60s), Live Score (TTL 5s), Session validation
- **Cloud Storage**: Upload flow — Client → API (validate file type/size) → Cloudinary/S3 → Lưu URL vào DB
- **Environment**: `.env` file với tối thiểu: DB config, JWT secrets, Redis, Cloudinary, VNPay keys
- **Monitoring**: PM2 logs, health check endpoint (`GET /health`)

### Dùng ở đâu trong dự án?
- `plan.md` Phase 5.2 (Performance & DevOps)
- `spec.md` mục 6 (Environment Variables)
- `rules.md` mục 3 (Git Workflow)

---
