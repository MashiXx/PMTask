# Custom Task Groups — Design

**Date:** 2026-06-17
**Status:** Approved (pending written-spec review)

## Overview

Replace the board's status/tag grouping with **user-defined custom groups**. Users
create named groups per project (e.g. "Frontend", "Backend", "Design"); the kanban
board shows one column per group and tasks are organized by dragging them between
group columns. Status (To Do / In Progress / Review / Done) is kept as a task
attribute but is no longer the board's column axis.

The sidebar "GROUP BY (Status/Tag)" control has already been removed (done in this
change set). This spec covers the new custom-group feature that replaces it.

## Goals

- Users define their own groups (columns) per project and assign each task to one.
- The kanban/list board is organized by these groups.
- Status remains a visible, editable task property.

## Non-goals (YAGNI)

- Per-user/global groups (groups are per-project only).
- Multiple groups per task (exactly one; null = ungrouped).
- Group templates, archiving, or cross-project group sharing.
- A project-membership system (see Permissions note).
- Grouping the board by status or tag again (that mode is removed).

## Confirmed decisions

| Decision | Choice |
|---|---|
| Board layout when grouped | Columns = custom groups; drag-drop moves a task between groups |
| Status | Kept as a task attribute (badge on card + editable); not the board axis |
| Groups per task | Exactly 1 (`groupId` nullable; null = ungrouped) |
| Group scope | Per-project (like Tag) |
| Who manages groups | Any authenticated user with access to the project (see Permissions) |
| Deleting a group with tasks | Tasks become ungrouped (`groupId = null`, `onDelete: SetNull`) |
| "Ungrouped" column | Always shown, at the start of the board |

## Data model

New model:

```prisma
model TaskGroup {
  id        Int      @id @default(autoincrement())
  name      String
  color     String   @default("#6C63FF")
  position  Int      @default(0)        // column order on the board
  projectId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     Task[]

  @@unique([name, projectId])           // group names unique within a project (like Tag)
}
```

Task changes:

```prisma
model Task {
  // ... existing fields ...
  groupId Int?                           // null = ungrouped
  group   TaskGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
}
```

Project changes: add `groups TaskGroup[]` relation.

**Migration:** create `TaskGroup` table + `Task.groupId` column. Non-destructive —
existing tasks start with `groupId = null` and appear in the "Ungrouped" column.
`onDelete: SetNull` ensures deleting a group ungroups (never deletes) its tasks.

## Permissions

Group create/update/delete/reorder require `isAuthenticated` **and** access to the
target project, reusing the existing access pattern.

> **Note / nuance:** the app has no project-membership concept. Project mutations are
> effectively owner-or-admin; task mutations are creator/assignee/admin
> ([`canModifyTask`](../../../src/controllers/task.controller.js)). The user asked for
> "all members" to manage groups. In practice this maps to **any user who can access
> the project** (owner + admin, plus task creators/assignees who already work in it).
> The implementation plan will define a single `canAccessProject(projectId, user)`
> helper and use it for both group endpoints and the extended move endpoint. True
> arbitrary multi-member access would require a project-members table — out of scope.

## Board UI

- Columns = the project's `TaskGroup`s ordered by `position`, **preceded by a fixed
  "Ungrouped" column** for tasks with `groupId = null`.
- Each column header shows the group name, color dot, and task count.
- Drag-and-drop a task to another column sets the task's `groupId` and `position`
  within that group.
- Group columns render with their `color`. The "Ungrouped" column is a neutral style.
- The old status-column kanban is no longer the board layout. The tag-grouping views
  (`partials/kanban-tag.ejs`, `partials/list-view-tag.ejs`) become obsolete and are
  removed; the new group board is modeled on that dynamic-column rendering pattern.

## Status handling

Because dragging now changes a task's **group** rather than its **status**:

- The task card shows a **status badge** (To Do / In Progress / Review / Done).
- Status is editable via a small dropdown on the card and via the existing task-detail
  page editor.
- `Hide completed` continues to filter by status `done`.
- Subtask-driven progress and the `done → 100%` rule are unchanged.

## Group management UI

A "Manage groups" modal (modeled on the existing tag-manager modal):

- List groups with name + color; add, rename, recolor, delete, and reorder (drag) to
  set column order.
- Entry point: a single "Manage groups" button in the board header, visible to any
  user with project access.

Endpoints (new `group.routes.js` + `group.controller.js`):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/groups` | Create group `{ projectId, name, color }` |
| `PUT` | `/api/groups/:id` | Rename / recolor |
| `DELETE` | `/api/groups/:id` | Delete (tasks → ungrouped) |
| `PATCH` | `/api/groups/reorder` | Persist column order `[{id, position}]` |

All validate project access and that the group/target project match.

## Move endpoint changes

`PATCH /api/tasks/:id/move` changes from `{ status, position }` to
`{ groupId, position }`:

- Validates the task is accessible and the target `groupId` (if not null) belongs to
  the task's project.
- Sets `groupId` + `position`. Status is **not** changed by board moves anymore.
- `groupId: null` is valid (moving into the "Ungrouped" column).

Frontend `kanban.js` Sortable `onEnd` reads `evt.to.dataset.groupId` (instead of
`dataset.status`) and sends `{ groupId, position }`.

## List view

The list view groups tasks into sections by `TaskGroup` (one section per group +
"Ungrouped"), replacing the status/tag list grouping.

## Edge cases

- **New task:** created with `groupId = null` → appears in "Ungrouped". (Optionally the
  create-task modal can offer a group picker — minor, can be a follow-up.)
- **Delete group:** `onDelete: SetNull` → its tasks move to "Ungrouped"; no task is lost.
- **Position:** `Task.position` is now ordering *within a group*. Reused as-is.
- **Cross-project drag:** not possible (board is single-project); move validates project.
- **Empty board (no groups):** only the "Ungrouped" column shows; user adds groups via
  the manage modal.
- **Name uniqueness:** enforced per project by `@@unique([name, projectId])`; API returns
  a clear error on duplicate.

## Affected files

- `prisma/schema.prisma` + new migration
- `src/controllers/task.controller.js` (`moveTask`, task queries to include `group`)
- `src/controllers/dashboard.controller.js` (load groups, group tasks for board/list)
- new `src/controllers/group.controller.js`, `src/routes/group.routes.js`, wired in `src/app.js`
- `src/views/partials/kanban.ejs` (render group columns + ungrouped) — replaces status board
- `src/views/partials/list-view.ejs` (group sections)
- remove `src/views/partials/kanban-tag.ejs`, `src/views/partials/list-view-tag.ejs`
- `src/views/partials/task-card.ejs` (status badge + `data-group-id`)
- `src/public/js/kanban.js` (drag sends `groupId`)
- `src/public/js/view-toggle.js` (drop now-dead status/tag group-restore logic)
- new group-manager modal partial + JS (modeled on tag manager)
- `src/views/dashboard.ejs` (script includes for group manager)

## Testing plan

- **Model/migration:** migration applies; existing tasks become ungrouped.
- **Group CRUD:** create/rename/recolor/delete/reorder; uniqueness error; access denied
  for users without project access.
- **Delete-with-tasks:** group delete sets member tasks to `groupId = null`.
- **Move:** dragging a task to another group updates `groupId` + `position`; status
  unchanged; moving to "Ungrouped" sets null; cross-project/unauthorized rejected.
- **Board render:** columns = groups in `position` order + leading "Ungrouped"; counts
  correct; status badge shows on cards; hide-completed still filters `done`.
- **List view:** sections per group + ungrouped.
