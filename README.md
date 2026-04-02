# PMTask

Ứng dụng quản lý dự án và theo dõi công việc, cho phép tổ chức task theo project, phân công cho thành viên, và theo dõi tiến độ.

## Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** SQLite + Prisma ORM
- **Frontend:** EJS + Vanilla JavaScript
- **Auth:** Passport.js (Local + Google OAuth 2.0)

## Tính năng chính

- Đăng ký / đăng nhập (local & Google OAuth)
- Tạo và quản lý nhiều project với màu sắc phân biệt
- Tạo task với tiêu đề, mô tả, mức ưu tiên, ngày hết hạn
- Theo dõi trạng thái task (todo, in_progress, review, done)
- Gắn tag cho task, lọc task theo tag
- Phân công task cho nhiều thành viên
- Dashboard tổng quan và admin panel

## Cài đặt

```bash
# Cài dependencies
npm install

# Cấu hình môi trường
cp .env.example .env
# Chỉnh sửa .env: DATABASE_URL, SESSION_SECRET, Google OAuth credentials

# Khởi tạo database
npx prisma migrate dev
npm run seed

# Chạy development server
npm run dev
```

Ứng dụng chạy tại `http://localhost:3000`.
