# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with nodemon (port 3000)
npm start            # Start production server
npm run seed         # Seed database with sample data (admin@pmtask.com / demo123)
npx prisma migrate dev          # Run migrations
npx prisma migrate dev --name <name>  # Create new migration
npx prisma studio    # Open database GUI
```

## Architecture

PMTask is a server-rendered MVC project management app using Express.js + EJS + Prisma (SQLite).

### Request Flow
Routes (`src/routes/`) → Controllers (`src/controllers/`) → Prisma ORM → SQLite (`prisma/dev.db`)

### Key Directories
- `src/routes/` — Express route definitions (auth, task, project, tag, subtask, document, admin, profile)
- `src/controllers/` — Business logic per domain
- `src/views/` — EJS templates; `partials/` for reusable components, `partials/modals/` for modal dialogs
- `src/public/js/` — Frontend vanilla JS modules (kanban drag-drop, modals, search, theme, etc.)
- `src/public/css/` — Stylesheets with light/dark theme support
- `src/config/` — Passport strategies, session config, multer upload config
- `src/middleware/auth.js` — `isAuthenticated`, `isGuest`, `isAdmin` middleware

### Data Model (Prisma)
Core models: User, Project, Task, SubTask, Tag, Folder, Document. Many-to-many via TaskTag and TaskAssignee junction tables. Folders support nesting (self-referential parentId).

### Auth & Roles
- Two roles: `admin` and `developer`. New registrations default to `pending` status (need admin approval).
- Passport local + Google OAuth 2.0 strategies.
- IDOR protection: tasks check creator/assignee/admin; projects check owner.

### Frontend Patterns
- Kanban board uses Sortable.js for drag-drop; position changes go through `PATCH /api/tasks/:id/move`.
- Views toggle between kanban and list, grouped by status or tags.
- Task progress auto-calculated from subtask completion: `doneSubtasks / (totalSubtasks + 1) * 100`.
- Global template vars: `currentUser`, `userTheme`, `success`/`error` flash messages (set in `src/app.js`).

### File Uploads
- Multer with 10MB limit, 5 files per request, whitelist-based extension + MIME validation.
- Upload path: `src/public/uploads/<projectId>/`. Filenames randomized with crypto.
- Folder password protection supported (optional, admin-set).
