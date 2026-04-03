<p align="center">
  <h1 align="center">PMTask</h1>
  <p align="center">Ứng dụng quản lý dự án và theo dõi công việc</p>
  <p align="center">
    <a href="README.md">English</a> | <a href="README.vi.md">Tiếng Việt</a>
  </p>
</p>

---

## Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Backend | Node.js + Express.js 5 |
| Database | SQLite + Prisma ORM |
| Frontend | EJS + Vanilla JavaScript + Sortable.js |
| Auth | Passport.js (Local + Google OAuth 2.0) |
| Bảo mật | Helmet, bcryptjs, express-rate-limit |

## Tính năng

- **Dự án** — Tạo và quản lý nhiều project với màu sắc phân biệt
- **Kanban Board** — Kéo thả task với Sortable.js
- **Giao diện** — Chuyển đổi giữa board và list view, nhóm theo trạng thái hoặc tag
- **Task** — Tiêu đề, mô tả, mức ưu tiên, ngày hết hạn, đánh dấu sao, phân công
- **Subtask** — Checklist với tính toán tiến độ tự động
- **Tag** — Gắn nhãn, lọc và nhóm task theo tag
- **Tài liệu** — Upload, xem trước (PDF/ảnh/Word), tổ chức folder với mật khẩu bảo vệ tùy chọn
- **Nhóm** — Phân công task cho nhiều thành viên
- **Dashboard** — Tổng quan với thống kê và theo dõi tiến độ
- **Admin Panel** — Quản lý người dùng, phê duyệt tài khoản, phân quyền
- **Giao diện** — Hỗ trợ dark / light / system theme
- **Tìm kiếm** — Tìm kiếm task real-time

## Bắt đầu nhanh

```bash
# Cài dependencies
npm install

# Cấu hình môi trường
cp .env.example .env
# Chỉnh sửa .env: SESSION_SECRET, Google OAuth credentials (tùy chọn)

# Khởi tạo database
npx prisma migrate dev

# Seed dữ liệu mẫu
npm run seed

# Chạy development server
npm run dev
```

Ứng dụng chạy tại `http://localhost:3000`

## Tài khoản mẫu

| Email | Mật khẩu | Vai trò |
|-------|-----------|---------|
| admin@pmtask.com | demo123 | Admin |
| dev@pmtask.com | demo123 | Developer |

## Phân quyền

| Vai trò | Quyền hạn |
|---------|-----------|
| **Admin** | Toàn quyền — project, task, tag, user, tài liệu |
| **Developer** | Tạo/chỉnh sửa task được phân công hoặc tự tạo, upload tài liệu |

> Tài khoản mới đăng ký có trạng thái `pending`, cần admin phê duyệt.

## Giấy phép

MIT
