# 🛠️ Công Nghệ Sử Dụng (Tech Stack & Skills)

> Tài liệu này quy định chính xác các công nghệ và phiên bản được dùng trong dự án.  
> **AI Agent hoặc thành viên mới:** Hãy đọc file này TRƯỚC KHI viết bất kỳ dòng code nào.

---

## 1. Backend (API Server)

| Công nghệ | Phiên bản | Mục đích |
|---|---|---|
| **Node.js** | >= 20 LTS | Runtime JavaScript/TypeScript |
| **TypeScript** | >= 5.x | Ngôn ngữ chính (Strict mode) |
| **NestJS** | >= 11.x | Framework Backend (Modular Monolith) |
| **Drizzle ORM** | >= 0.45.x | ORM hiện đại, type-safe, SQL-first |
| **Drizzle Kit** | >= 0.31.x | CLI tool để generate migration & push schema |
| **PostgreSQL** | >= 16.x | Database chính (hỗ trợ JSONB, PostGIS, UUID) |
| **PostGIS** | Extension | Xử lý dữ liệu địa lý (tìm sân gần tôi) |
| **Redis** | >= 7.x | Caching (Leaderboard, Live Score) & Message Queue |
| **Passport.js** | Latest | Xử lý Authentication (JWT Strategy) |
| **bcrypt** | Latest | Hash mật khẩu |
| **class-validator** | Latest | Validate DTO (Data Transfer Object) |
| **class-transformer** | Latest | Transform/Serialize response |
| **@nestjs/swagger** | Latest | Auto-generate API Documentation |
| **Socket.io / @nestjs/websockets** | Latest | Real-time: Live Score, Chat |

---

## 2. Web Frontend

| Công nghệ | Phiên bản | Mục đích |
|---|---|---|
| **Next.js** | >= 15.x (App Router) | Framework React fullstack |
| **React** | >= 19.x | UI Library |
| **TypeScript** | >= 5.x | Ngôn ngữ chính |
| **TailwindCSS** | >= 4.x | Styling utility-first |
| **Zustand** | Latest | State management (nhẹ hơn Redux) |
| **Axios** hoặc **ky** | Latest | HTTP Client gọi API |
| **Socket.io-client** | Latest | Nhận live score real-time |

---

## 3. Mobile App (Phase tương lai)

| Công nghệ | Phiên bản | Mục đích |
|---|---|---|
| **Flutter** hoặc **React Native** | Latest Stable | Cross-platform (iOS + Android) |
| **Dio** (Flutter) / **Axios** (RN) | Latest | HTTP Client |
| **Firebase Cloud Messaging** | Latest | Push Notification |

---

## 4. DevOps & Công cụ

| Công nghệ | Mục đích |
|---|---|
| **Docker** + **Docker Compose** | Container hóa toàn bộ hệ thống (DB, Redis, API) |
| **pnpm** | Package manager (nhanh, tiết kiệm dung lượng) |
| **ESLint** + **Prettier** | Linting & Format code tự động |
| **Git** + **GitHub** | Version control & Collaboration |
| **GitHub Actions** | CI/CD Pipeline |
| **Postman** / **Insomnia** | Test API thủ công |
| **pgAdmin** | Quản lý PostgreSQL qua giao diện |
| **Cloudinary** hoặc **AWS S3** | Lưu trữ ảnh (avatar, banner, evidence) |

---

## 5. Yêu cầu kỹ năng tối thiểu cho thành viên

### Backend Developer
- Thành thạo TypeScript, hiểu rõ Generics & Decorators.
- Nắm vững NestJS: Module, Controller, Service, Guard, Interceptor, Pipe.
- Hiểu relational database: JOIN, Transaction, Index, Foreign Key.
- Đọc hiểu SQL thuần (để review Drizzle Schema).

### Frontend Developer
- Thành thạo React + Next.js (App Router, Server Components).
- Hiểu REST API, HTTP methods, Auth flow (JWT).
- Quen thuộc với TailwindCSS.

### Cả hai
- Sử dụng thành thạo Git (branching, merge, rebase).
- Biết đọc Swagger API docs.
- Quen Docker cơ bản (`docker-compose up`).
