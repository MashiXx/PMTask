# Task Comments — Design Spec

**Date:** 2026-06-24
**Status:** Approved

## Purpose

Let users record progress notes on a task through comments. Comments support a
single level of replies (2 levels total: a top-level comment and its replies —
no deeper nesting).

## Decisions (from brainstorming)

- **Placement:** both the task preview modal and the task detail page (`/tasks/:id`).
- **Permissions:** creator / assignee / admin can post (same rule as
  `canModifyTask`). A comment can be edited or deleted only by its author or an
  admin. Public/guest visitors see comments read-only (when `project.publicTasks`).
- **Editing & format:** add / edit / delete, content rendered as **markdown**
  (reusing the `marked` + `DOMPurify` pipeline used by the description field).
- **Timestamps:** relative time (e.g. "5 minutes ago") with the absolute
  date/time in the element's `title` tooltip. An "(edited)" marker shows when
  `updatedAt > createdAt`.
- **Section label:** "Comments".

## Data Model

New Prisma model `TaskComment` (self-referential for the single reply level):

```prisma
model TaskComment {
  id        Int      @id @default(autoincrement())
  content   String   @db.Text
  taskId    Int
  authorId  Int
  parentId  Int?     // null = top-level comment; set = reply
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task    Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author  User         @relation("CommentAuthor", fields: [authorId], references: [id])
  parent  TaskComment? @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies TaskComment[] @relation("CommentReplies")
}
```

Add relations:
- `Task.comments   TaskComment[]`
- `User.comments   TaskComment[] @relation("CommentAuthor")`

**2-level enforcement (server-side):** a reply may only attach to a top-level
comment. On `POST` with a `parentId`, load the parent; if `parent.parentId` is
not null (i.e. the target is itself a reply), reject with `400`. Also verify the
parent belongs to the same `taskId`. The UI only renders a "Reply" affordance on
top-level comments, so this is a guard, not the normal path.

**Cascade:** deleting a top-level comment deletes its replies
(`onDelete: Cascade` on the self-relation). Deleting a task deletes all its
comments.

Migration: `npm run migrate -- --name add_task_comments`.

## Backend

New `src/routes/comment.routes.js` + `src/controllers/comment.controller.js`,
mounted at `/api/comments` in `src/app.js`. Mirrors the subtask
routes/controller patterns.

| Method | Path                      | Auth                         | Body                  |
|--------|---------------------------|------------------------------|-----------------------|
| GET    | `/api/comments/task/:taskId` | public if `project.publicTasks`, else `isAuthenticated` | — |
| POST   | `/api/comments/task/:taskId` | `isAuthenticated` + `canModifyTask` | `{ content, parentId? }` |
| PUT    | `/api/comments/:id`       | `isAuthenticated` + (author or admin) | `{ content }` |
| DELETE | `/api/comments/:id`       | `isAuthenticated` + (author or admin) | — |

`canModifyTask` (creator/assignee/admin) is duplicated/shared from the subtask
controller's pattern. Validation: reject empty/whitespace-only `content`; trim
content; enforce a reasonable max length (e.g. 5000 chars).

**GET response shape** (top-level comments, each with nested `replies`, both
ordered by `createdAt` asc):

```json
[
  {
    "id": 1,
    "content": "Started the API work",
    "author": { "id": 3, "name": "Mashi", "avatar": null },
    "createdAt": "2026-06-24T09:00:00.000Z",
    "updatedAt": "2026-06-24T09:00:00.000Z",
    "replies": [
      {
        "id": 2,
        "content": "Looks good",
        "author": { "id": 5, "name": "Anita", "avatar": null },
        "createdAt": "2026-06-24T09:05:00.000Z",
        "updatedAt": "2026-06-24T09:05:00.000Z"
      }
    ]
  }
]
```

Comments are fetched via this dedicated endpoint (not embedded in the
`GET /api/tasks/:id` payload) to keep the task payload lean.

## Frontend

New module `src/public/js/comment.js` exposing a mount/load API similar to
`TaskAttachments`:

```js
window.TaskComments.mount({
  container,        // element id to render into
  inputContainer,   // element id for the new-comment composer
  taskId,
  canEdit,          // false for guests/public → read-only
  currentUserId,
  isAdmin,
});
```

Behavior:
- Fetch `GET /api/comments/task/:taskId`, render top-level comments with author
  avatar + name + relative timestamp (absolute in `title`), markdown-rendered
  content, and "(edited)" when applicable.
- Top-level comments show a **Reply** button → inline reply composer. Replies
  render indented under their parent and have **no** Reply button.
- Author or admin sees **Edit** (inline textarea) and **Delete** (with confirm)
  on their comments.
- Composer posts via `POST`; edits via `PUT`; deletes via `DELETE`; re-render
  after each.
- Markdown rendered with `marked` + `DOMPurify` (already loaded for the
  description). Plain newlines preserved.
- `canEdit === false` → hide composer, reply, edit, delete (read-only view).

**Preview modal** ([task-preview-modal.ejs](../../../src/views/partials/modals/task-preview-modal.ejs)):
add a "Comments" block in the main column **below Attachments** with a
`#previewComments` list and a composer. `openTaskPreview` mounts `TaskComments`
with the current user/guest flags (reusing `window.IS_GUEST`, current user id).

**Detail page** ([task-detail.ejs](../../../src/views/task-detail.ejs)): add a
"Comments" section inside `.task-detail-main` and mount `TaskComments` on load.

Guest/public read-only follows the existing `preview-auth-btn` / `IS_GUEST`
conventions.

## Out of scope (YAGNI)

- Deeper than 2 levels of nesting.
- @mentions, reactions, attachments on comments.
- Real-time updates / websockets (re-fetch on action is enough).
- Editing history beyond the "(edited)" marker.
```
