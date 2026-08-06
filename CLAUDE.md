# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with nodemon (port 3000)
npm start            # Start production server
npm run seed         # Seed database with sample data (admin@pmtask.com / demo123)
npm run migrate      # Run migrations (prisma migrate dev)
npm run migrate -- --name <name>  # Create new migration
npm run generate     # Regenerate Prisma client
npm run studio       # Open database GUI
npm run prisma -- <cmd>           # Run any Prisma CLI command
npm run prune-uploads             # Audit uploads vs DB: report orphan files & dangling DB rows
npm run prune-uploads -- --delete # Also delete orphaned files (run where the files live)
```

> Prisma scripts go through `prisma/prisma-cli.js`, which assembles `DATABASE_URL`
> from the `DB_*` components in `.env`. Run Prisma via these npm scripts (not raw
> `npx prisma`) so the connection string is built correctly.

## Architecture

PMTask is a server-rendered MVC project management app using Express.js + EJS + Prisma (MySQL).

### Request Flow
Routes (`src/routes/`) → Controllers (`src/controllers/`) → Prisma ORM → MySQL

Database connection is configured via the `DB_*` components in `.env` (host, port, user, password, name). `src/config/database.js` assembles these into `DATABASE_URL` for Prisma; a full `DATABASE_URL` can be set to override them.

### Key Directories
- `src/routes/` — Express route definitions (auth, dashboard, task, attachment, project, tag, group, diagram, subtask, comment, document, note, admin, profile)
- `src/controllers/` — Business logic per domain (one controller per route domain, plus `diagram` and `dashboard`)
- `src/views/` — EJS templates; `partials/` for reusable components, `partials/modals/` for modal dialogs
- `src/public/js/` — Frontend vanilla JS modules (kanban drag-drop, modals, search, theme, diagram/mindmap editor, notes, etc.)
- `src/public/css/` — Stylesheets with light/dark theme support
- `src/config/` — Passport strategies, session config, i18n, multer upload configs (one per upload domain)
- `src/locales/` — i18n dictionaries (`en.json`, `vi.json`); server helper in `src/config/i18n.js`
- `src/middleware/auth.js` — `isAuthenticated`, `isGuest`, `isAdmin` middleware

### Data Model (Prisma)
Core models: User, Project, Task, SubTask, Tag, TaskGroup, Folder, Document, Note.
- **Tasks** belong to a Project, optionally to a TaskGroup (kanban column, `onDelete: SetNull`), and link many-to-many to Tag (TaskTag) and User (TaskAssignee) via junction tables. A task also has SubTask checklist items, TaskAttachment files, and threaded TaskComment (self-referential `parentId` for replies).
- **Documents** live in a Project, optionally inside a Folder; folders nest via self-referential `parentId` and support optional password protection.
- **Notes** are private (owner-only), carry a background `color`, embed images/video (NoteMedia), and are classified by user-scoped labels (NoteLabel ↔ NoteLabelLink, many-to-many).
- **Diagrams** (mindmap / flowchart / architecture) belong to a Project and hold DiagramNode + DiagramEdge. A node can optionally link to a Task.

> **Naming gotcha (legacy DB names):** the feature was renamed from "mindmap" to "diagram". Application code (Prisma models/fields, controller, API payloads, `window.DIAGRAM*` globals) reads as `diagram`/`diagramId` throughout. Only the **physical MySQL layer** keeps the old names, bridged by Prisma annotations: models `Diagram`/`DiagramNode`/`DiagramEdge` map to tables `Mindmap`/`MindmapNode`/`MindmapEdge` (`@@map`), and field `diagramId` maps to column `mindmapId` (`@map`). Renaming the physical tables/column would need a data migration; the `@map`/`@@map` bridge avoids it. Old `/projects/:slug/mindmaps` URLs 301-redirect to `/diagrams`.
>
> **"mindmap" is a real diagram type, not debt:** `Diagram.type` is one of `mindmap` | `flowchart` | `architecture`. The front-end has two engines by type — `mindmap.js` (+ `mindmap-layout/color/search.js`, `mm-*` UI) renders the tree-layout **mindmap** type; `diagram.js` (+ `diagram-clipboard.js`, `dg-*` UI) renders the free-form **flowchart/architecture** types. `mm-ui.js` and `mindmap-history.js` are shared by both. So `mindmap*` front-end names are intentional (type-specific), not leftover — don't blanket-rename them.

### Auth & Roles
- Two roles: `admin` and `developer`. New registrations default to `pending` status (need admin approval).
- Passport local + Google OAuth 2.0 strategies.
- IDOR protection: tasks check creator/assignee/admin; projects check owner.

### Frontend Patterns
- Kanban board uses Sortable.js for drag-drop; position changes go through `PATCH /api/tasks/:id/move`.
- Views toggle between kanban and list, grouped by status, tags, or custom TaskGroups.
- Task progress auto-calculated from subtask completion: `doneSubtasks / (totalSubtasks + 1) * 100`.
- Diagram editor is a custom canvas engine (no external diagram lib); files split across `diagram*.js` and `mindmap*.js` in `src/public/js/`.
- Global template vars: `currentUser`, `userTheme`, `lang`, `t()` (i18n translate), `success`/`error` flash messages (all set in `src/app.js`).

### i18n
- Two locales: English (`en`) and Vietnamese (`vi`), dictionaries in `src/locales/`.
- Language resolves per request: user preference → `pmtask-lang` cookie → default `en` (`src/app.js`).
- Server-side: `res.locals.t(key, vars)` in views, `req.t` in controllers (for flash messages). Client-side strings are embedded as `clientI18n` and consumed by `src/public/js/i18n.js`.

### File Uploads
- Multer with 10MB limit, 5 files per request, whitelist-based extension + MIME validation.
- Upload paths (under `uploads/`, served via controllers, not statically):
  - Project documents: `uploads/<projectId>/`
  - Task attachments: `uploads/tasks/<taskId>/` (served by `/api/attachments/...`)
  - Note media: `uploads/notes/<noteId>/` (images + video, 50MB; owner-only, served by `GET /notes/api/media/:id`)
  - User avatars: `uploads/avatars/` (image-only, 5MB; served by `GET /users/:id/avatar`)
- Filenames randomized with crypto. Folder password protection supported (optional, admin-set).
- `User.avatar` holds either a local relative path (uploaded) or an http URL (Google). The
  `partials/avatar.ejs` partial renders the `<img>` (or initials fallback) anywhere an avatar shows.
- Deleting a task/project removes its files from disk; `npm run prune-uploads` audits orphans.
