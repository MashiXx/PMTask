# PMTask

Ứng dụng quản lý dự án và theo dõi công việc, cho phép tổ chức task theo project, phân công cho thành viên, và theo dõi tiến độ.

## Tech Stack

- **Backend:** Node.js + Express.js 5
- **Database:** SQLite + Prisma ORM
- **Frontend:** EJS + Vanilla JavaScript + Sortable.js
- **Auth:** Passport.js (Local + Google OAuth 2.0)
- **Security:** Helmet, bcryptjs, express-rate-limit

## Tính năng chính

- Đăng ký / đăng nhập (local & Google OAuth)
- Tạo và quản lý nhiều project với màu sắc phân biệt
- Tạo task với tiêu đề, mô tả, mức ưu tiên, ngày hết hạn
- Kanban board với drag-and-drop (Sortable.js)
- Chuyển đổi giữa giao diện board và list view
- Theo dõi trạng thái task (todo, in_progress, review, done)
- Subtask với tính toán tiến độ tự động
- Gắn tag cho task, lọc và nhóm task theo tag
- Phân công task cho nhiều thành viên
- Quản lý tài liệu với hỗ trợ folder (mật khẩu bảo vệ tùy chọn)
- Upload file với kiểm tra loại file và MIME type
- Xem trước tài liệu (PDF, ảnh, Word)
- Dashboard tổng quan với thống kê
- Admin panel quản lý người dùng (phê duyệt, phân quyền)
- Hỗ trợ dark/light/system theme
- Tìm kiếm task real-time
- Đánh dấu task quan trọng (starred)

## Cài đặt

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
```

## Chạy ứng dụng

```bash
# Development (auto-reload với nodemon)
npm run dev

# Production
npm start
```

Ứng dụng chạy tại `http://localhost:3000`.

## Tài khoản mẫu

| Email | Mật khẩu | Vai trò |
|-------|-----------|---------|
| admin@pmtask.com | demo123 | Admin |
| dev@pmtask.com | demo123 | Developer |

## Phân quyền

- **Admin:** Toàn quyền — quản lý project, task, tag, user, tài liệu
- **Developer:** Tạo và chỉnh sửa task được phân công hoặc tự tạo, upload tài liệu
- Tài khoản mới đăng ký có trạng thái `pending`, cần admin phê duyệt

---

# PMTask (English)

A project management and task tracking application that organizes tasks by project, assigns them to team members, and tracks progress.

## Tech Stack

- **Backend:** Node.js + Express.js 5
- **Database:** SQLite + Prisma ORM
- **Frontend:** EJS + Vanilla JavaScript + Sortable.js
- **Auth:** Passport.js (Local + Google OAuth 2.0)
- **Security:** Helmet, bcryptjs, express-rate-limit

## Key Features

- Registration / login (local & Google OAuth)
- Create and manage multiple projects with color coding
- Create tasks with title, description, priority, and due date
- Kanban board with drag-and-drop (Sortable.js)
- Toggle between board and list view
- Track task status (todo, in_progress, review, done)
- Subtasks with automatic progress calculation
- Tag tasks, filter and group tasks by tag
- Assign tasks to multiple members
- Document management with folder support (optional password protection)
- File upload with extension and MIME type validation
- Document preview (PDF, images, Word)
- Dashboard overview with statistics
- Admin panel for user management (approval, role assignment)
- Dark/light/system theme support
- Real-time task search
- Star important tasks

## Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env: SESSION_SECRET, Google OAuth credentials (optional)

# Initialize database
npx prisma migrate dev

# Seed sample data
npm run seed
```

## Running

```bash
# Development (auto-reload with nodemon)
npm run dev

# Production
npm start
```

The app runs at `http://localhost:3000`.

## Sample Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@pmtask.com | demo123 | Admin |
| dev@pmtask.com | demo123 | Developer |

## Roles & Permissions

- **Admin:** Full access — manage projects, tasks, tags, users, documents
- **Developer:** Create and edit assigned or self-created tasks, upload documents
- Newly registered accounts have `pending` status and require admin approval
