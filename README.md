<p align="center">
  <h1 align="center">PMTask</h1>
  <p align="center">A full-stack project management and task tracking application</p>
  <p align="center">
    <a href="README.md">English</a> | <a href="README.vi.md">Tiếng Việt</a>
  </p>
</p>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express.js 5 |
| Database | SQLite + Prisma ORM |
| Frontend | EJS + Vanilla JavaScript + Sortable.js |
| Auth | Passport.js (Local + Google OAuth 2.0) |
| Security | Helmet, bcryptjs, express-rate-limit |

## Features

- **Projects** — Create and manage multiple projects with color coding
- **Kanban Board** — Drag-and-drop task management with Sortable.js
- **Views** — Toggle between board and list view, group by status or tags
- **Tasks** — Title, description, priority, due date, starred, assignees
- **Subtasks** — Checklist items with automatic progress calculation
- **Tags** — Label, filter, and group tasks by tag
- **Documents** — Upload, preview (PDF/images/Word), folder organization with optional password protection
- **Team** — Assign tasks to multiple members
- **Dashboard** — Overview with statistics and progress tracking
- **Admin Panel** — User management with approval workflow and role assignment
- **Themes** — Dark / light / system theme support
- **Search** — Real-time task search

## Quick Start

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

# Start development server
npm run dev
```

App runs at `http://localhost:3000`

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@pmtask.com | demo123 | Admin |
| dev@pmtask.com | demo123 | Developer |

## Roles & Permissions

| Role | Access |
|------|--------|
| **Admin** | Full access — projects, tasks, tags, users, documents |
| **Developer** | Create/edit own or assigned tasks, upload documents |

> New registrations default to `pending` status and require admin approval.

## License

MIT
