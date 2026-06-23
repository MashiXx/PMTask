# Task Attachments — Design

**Date:** 2026-06-23

## Goal
Allow users to attach images and files to a Task, with image thumbnails + a
lightbox for full-size viewing, available on both the **task detail page** and
the **quick task preview popup** (the kanban `taskPreviewModal`).

## Context
PMTask already has a complete, hardened file system for **project documents**:
- `src/config/upload.js` — Multer disk storage, 10 MB / 5-file limits, extension
  + MIME whitelist (images, office docs, text/code, archives), filename
  sanitisation.
- `Document` model + `document.controller.js` — upload, download (RFC 5987
  filename headers), inline preview (image/pdf/text/docx), delete, latin1→utf8
  filename fix, path-traversal guards.

Documents attach to `Project`/`Folder` only. Tasks have **no** attachment
concept. This feature wires task attachments onto the same infrastructure
without overloading `Document` (which carries folder/password semantics).

## Data Model
New `TaskAttachment` model (separate from `Document`):

```prisma
model TaskAttachment {
  id           Int      @id @default(autoincrement())
  filename     String   // original (user) filename
  filepath     String   // path relative to uploadDir
  mimeType     String
  size         Int
  taskId       Int
  uploadedById Int
  createdAt    DateTime @default(now())

  task       Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploadedBy User @relation("AttachmentUploader", fields: [uploadedById], references: [id])

  @@index([taskId])
}
```
- `Task` gains `attachments TaskAttachment[]`.
- `User` gains `attachments TaskAttachment[] @relation("AttachmentUploader")`.
- Deleting a task cascades the DB rows; the controller removes files from disk
  (mirrors `Document` behaviour).

**Storage:** files saved under `uploads/tasks/<taskId>/`, crypto-random
filenames, same whitelist + limits as documents.

## Backend
- **`src/config/upload.js`** — export the shared `fileFilter`, `ALLOWED_*`
  lists, and `uploadDir` so they can be reused (no behaviour change to existing
  project upload).
- **`src/config/task-upload.js`** — new Multer instance; destination keyed on
  `req.params.taskId` → `uploads/tasks/<taskId>/`; reuses shared `fileFilter`
  and limits.
- **`src/utils/file-serve.js`** — shared helpers `isPathSafe(absPath)` and
  `setDownloadHeaders(res, filename)` (RFC 5987), used by the new controller.
- **`src/controllers/task-attachment.controller.js`**
  - `uploadAttachment` — requires file; verifies task exists and user may modify
    it (admin / creator / assignee); stores relative path; latin1→utf8 filename
    fix; cleans up file on any failure.
  - `previewAttachment` — streams images & PDFs inline (`X-Content-Type-Options:
    nosniff`); other types return JSON `{ type: 'unsupported' }`. Guests allowed
    only when `project.publicTasks`.
  - `downloadAttachment` — RFC 5987 headers; same guest rule.
  - `deleteAttachment` — same modify permission; removes DB row + disk file.
- **`src/routes/attachment.routes.js`** mounted at `/api/attachments`:
  - `POST   /tasks/:taskId` (auth + multer wrapper with friendly size/count errors)
  - `GET    /:id/preview`
  - `GET    /:id/download`
  - `DELETE /:id` (auth)
- **`task.controller.js`** — include `attachments` (with `uploadedBy.name`) in
  `getTask` and `getTaskPage`.

## Frontend
- **`src/public/js/task-attachments.js`** (shared module):
  - `renderTaskAttachments(container, attachments, { canEdit, onChange })` —
    image thumbnails in a grid (click → lightbox) + non-image rows (icon, name,
    size, download); delete button when `canEdit`.
  - `uploadTaskAttachments(taskId, files, onDone)` — one `FormData` POST per file
    with progress, friendly errors.
  - `deleteTaskAttachmentById(id, onDone)`.
  - lightbox overlay for full-size images (Esc / click-out to close).
  - helpers: `formatSize`, `escapeHtml`, `isImageMime`.
- **task-detail page** (`task-detail.ejs`): new `ATTACHMENTS` section — grid +
  file input (with drag-drop); `window.TASK_DATA.attachments` seeds the render;
  uploads/deletes re-render in place.
- **quick preview modal** (`task-preview-modal.ejs`): an attachments block;
  `openTaskPreview` renders from the fetched task; upload/delete refresh the
  block. Always an existing task, so no deferred-upload needed. Hidden controls
  for guests.
- **CSS** (`main.css`): thumbnail grid, file-row, and lightbox styles (light +
  dark theme).

## Permissions / Security
- Upload & delete: admin, task creator, or assignee (reuses task modify rule).
- View/preview/download: authenticated users, plus guests when the project has
  `publicTasks` enabled (mirrors `getTask`).
- Reuses path-traversal guards, whitelist, size/count limits, and `nosniff`
  from the existing document system.

## Out of Scope (YAGNI)
- Folder/password semantics for task files.
- DOCX/text inline preview for attachments (download instead; images + PDF
  preview inline).
- Reordering attachments; per-attachment rename.
