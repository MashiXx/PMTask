# Thiết kế: Đa loại sơ đồ (Diagram) — Mindmap, Flowchart, Architecture

Ngày: 2026-07-10
Trạng thái: Đã duyệt hướng thiết kế, chờ viết plan.

## 1. Mục tiêu & bối cảnh

Mindmap hiện tại chỉ hỗ trợ cấu trúc **cây** (mỗi node một cha, cạnh ngầm định qua
`parentId`, auto-layout dạng tidy-tree). Người dùng cần thêm hai loại sơ đồ:

- **Flowchart** — lưu đồ: box + mũi tên tự do, nhiều hình dạng (quyết định, bắt
  đầu/kết thúc, input/output), nhãn trên mũi tên (Yes/No...).
- **Architecture Diagram** — sơ đồ kiến trúc: box + mũi tên tự do, **khung nhóm**
  bao quanh cụm box (VD "AWS Cloud", "Backend"), nhãn dịch vụ.

Yêu cầu người dùng:
- Cả ba loại nằm **chung một danh sách/thư mục** trong mỗi project.
- Khi **tạo mới** thì **chọn type** để biết dùng loại nào.
- Cách tạo/chỉnh sửa: **kéo-thả trực quan** (đồng bộ trải nghiệm mindmap), KHÔNG
  dùng cú pháp text kiểu Mermaid.

### Quyết định chốt trong brainstorming
- Mô hình dữ liệu: **gom chung thành khái niệm `Diagram`** với trường `type`.
- Flowchart và Architecture **dùng chung một engine editor "sơ đồ tự do"**; khác
  nhau chủ yếu ở bảng hình dạng/mặc định. Mindmap **giữ nguyên** editor cây hiện có.
- Đổi tên **model** (không đổi tên **bảng DB**) để không phải migrate dữ liệu cũ.

## 2. Phạm vi

### Trong phạm vi
- Trường `type` phân biệt 3 loại sơ đồ.
- Bảng cạnh tự do (`DiagramEdge`) cho flowchart/architecture.
- Hình dạng node (`shape`) + khung nhóm (dùng lại `parentId` làm quan hệ "chứa").
- Nhãn trên cạnh.
- Editor "sơ đồ tự do" mới (kéo-thả box, vẽ mũi tên, nhóm) tái dùng hạ tầng
  pan/zoom, undo/redo, export PNG, modal của mindmap.
- Trang danh sách chung có badge theo type; nút "Tạo mới" cho chọn type.

### Ngoài phạm vi (YAGNI — để giai đoạn sau)
- Auto-layout cho đồ thị tự do (flowchart/architecture đặt tay).
- Thư viện icon dịch vụ cloud dựng sẵn (AWS/GCP...).
- Xuất định dạng khác PNG (SVG, PDF).
- Cộng tác realtime.
- Kiểu đường cong/định tuyến cạnh nâng cao (dùng đường thẳng/gấp khúc đơn giản).

## 3. Mô hình dữ liệu (Prisma)

Giữ nguyên **tên bảng** hiện tại qua `@@map` để dữ liệu mindmap cũ không phải
migrate; chỉ đổi **tên model** (mức code) và **thêm cột/bảng mới**.

```prisma
model Diagram {
  id        Int      @id @default(autoincrement())
  name      String
  type      String   @default("mindmap")  // "mindmap" | "flowchart" | "architecture"
  projectId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  project   Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  nodes     DiagramNode[]
  edges     DiagramEdge[]

  @@map("Mindmap")
}

model DiagramNode {
  id        Int      @id @default(autoincrement())
  diagramId Int      @map("mindmapId")
  parentId  Int?     // mindmap: node cha; flowchart/arch: khung nhóm chứa (null = ngoài cùng)
  label     String   @db.Text
  shape     String   @default("rect") // rect | diamond | ellipse | parallelogram | group
  color     String?
  x         Float?   // loại tự do: luôn có giá trị (đặt tay); mindmap: null = auto-layout
  y         Float?
  width     Float?   // dùng cho khung nhóm / box có kích thước tùy chỉnh
  height    Float?
  position  Int      @default(0)
  collapsed Boolean  @default(false)
  taskId    Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  diagram      Diagram       @relation(fields: [diagramId], references: [id], onDelete: Cascade)
  parent       DiagramNode?  @relation("NodeChildren", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children     DiagramNode[] @relation("NodeChildren")
  task         Task?         @relation(fields: [taskId], references: [id], onDelete: SetNull)
  edgesFrom    DiagramEdge[] @relation("EdgeSource")
  edgesTo      DiagramEdge[] @relation("EdgeTarget")

  @@index([diagramId])
  @@index([parentId])
  @@index([taskId])
  @@map("MindmapNode")
}

model DiagramEdge {
  id        Int      @id @default(autoincrement())
  diagramId Int
  sourceId  Int
  targetId  Int
  label     String?  @db.Text
  style     String?  // vd: "solid" | "dashed"; hướng mũi tên ngầm định source->target
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  diagram Diagram     @relation(fields: [diagramId], references: [id], onDelete: Cascade)
  source  DiagramNode @relation("EdgeSource", fields: [sourceId], references: [id], onDelete: Cascade)
  target  DiagramNode @relation("EdgeTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@index([diagramId])
  @@index([sourceId])
  @@index([targetId])
}
```

Cập nhật quan hệ ngược:
- `Project.mindmaps` → `Project.diagrams Diagram[]`.
- `Task.mindmapNodes` → `Task.diagramNodes DiagramNode[]`.

### Ghi chú migration
- Tạo migration thêm: cột `type` trên `Mindmap`; cột `shape`, `width`, `height`
  trên `MindmapNode`; bảng mới `DiagramEdge`.
- Tuân thủ ràng buộc dự án: **không để Prisma DROP bảng `sessions`** (xem memory
  [[prisma-sessions-migrate-drift]]); chạy migrate ở chế độ non-interactive bằng
  `migrate diff` + `migrate deploy` khi ở agent/CI (xem [[prisma-migrate-non-interactive]]).
- FK tự tham chiếu `parentId` vẫn `ON DELETE NO ACTION` → controller xóa
  subtree/nhóm thủ công (giữ pattern hiện tại), và xóa cạnh liên quan trong cùng
  transaction.

## 4. Backend

### Routes
Đổi base sang `/api/diagrams` (giữ redirect/alias từ `/api/mindmaps` cho tương thích):

```
GET    /api/diagrams?projectId=   getDiagramsByProject
POST   /api/diagrams              createDiagram        (body có `type`)
GET    /api/diagrams/:id          getDiagram           (trả { diagram, nodes, edges })
PUT    /api/diagrams/:id          updateDiagram        (rename)
DELETE /api/diagrams/:id          deleteDiagram

POST   /api/diagram-nodes         createNode           (nhận shape, parentId nhóm)
PUT    /api/diagram-nodes/:id     updateNode           (label/shape/color/x/y/width/height/collapsed/parentId)
DELETE /api/diagram-nodes/:id     deleteNode           (xóa node + cạnh liên quan; xóa khung nhóm thì GỠ thành viên ra ngoài, KHÔNG xóa thành viên)
POST   /api/diagram-nodes/:id/convert  convertNode     (giữ nguyên: node -> Task)

POST   /api/diagram-edges         createEdge           (diagramId, sourceId, targetId, label?)
PUT    /api/diagram-edges/:id     updateEdge           (label/style)
DELETE /api/diagram-edges/:id     deleteEdge
```

Trang (page routes, dưới project): base `/projects/:projectSlug/diagrams`
- `GET /`            danh sách sơ đồ (mọi type).
- `GET /:diagramId`  canvas — controller chọn view/bundle theo `diagram.type`.

Giữ redirect 301 từ `/projects/:slug/mindmaps[...]` sang `/diagrams` tương ứng.

### Controller (`src/controllers/diagram.controller.js` — đổi tên từ mindmap.controller.js)
- Giữ helper `userCanAccessProject`, `loadDiagram`, `loadNode` (eager-load project để auth).
- `createDiagram`: theo `type`:
  - `mindmap` → tạo root node (`parentId: null`, `shape: "rect"`, label = tên) như hiện tại.
  - `flowchart` / `architecture` → tạo rỗng, hoặc 1 box khởi đầu ở giữa (có `x`,`y`).
- `getDiagram`: trả thêm `edges` (đã lọc theo diagram).
- `createNode`/`updateNode`: nhận thêm `shape`, `width`, `height`, `parentId` (nhóm).
  Validate `parentId` thuộc cùng diagram.
- `deleteNode`: xóa cạnh có `sourceId`/`targetId` = node trong `prisma.$transaction`.
  Nếu mindmap: xóa cả subtree, deepest-first cho FK NoAction. Nếu là khung `group`:
  **gỡ** thành viên (`parentId` → null), KHÔNG xóa thành viên, rồi xóa khung.
- `createEdge`/`updateEdge`/`deleteEdge`: chỉ cho phép với diagram type tự do;
  validate source/target thuộc cùng diagram; chặn cạnh cho type `mindmap`.

## 5. Frontend

### Chọn engine theo type (trang canvas)
Controller canvas truyền `window.DIAGRAM = { id, type, projectSlug }` và load bundle:
- `type === "mindmap"` → `mindmap.js` (giữ nguyên toàn bộ hành vi hiện tại).
- `type === "flowchart" | "architecture"` → **`diagram.js` mới**.

### Engine "sơ đồ tự do" (`src/public/js/diagram.js`)
Tái dùng cách render của mindmap (div tuyệt đối trong `#viewport` + `<svg>` cho
cạnh) và các module dùng chung:
- Render node theo `shape`: rect/diamond/ellipse/parallelogram bằng SVG hoặc
  div + clip-path; `group` là khung bao (border, nhãn góc) nằm dưới các node con.
- Cạnh: `<path>` SVG có **mũi tên** (marker) + **nhãn** đặt giữa cạnh. Vẽ cạnh
  bằng cách kéo từ "chấm nối" (connection handle) trên box tới box đích.
- Kéo di chuyển box; kéo cạnh viền để đổi kích thước (box/nhóm).
- Nhóm: đặt box vào trong khung → set `parentId` = id nhóm; di chuyển nhóm kéo
  theo thành viên.
- **Tái dùng**: `mm-ui.js` (prompt/confirm/toast), logic pan/zoom (transform),
  undo/redo `mindmap-history.js` (mở rộng lệnh cho node+edge), export
  `html-to-image`, modal task-preview + convert-to-task.
- Toolbar hình dạng đổi theo type:
  - flowchart: rect, diamond (quyết định), ellipse (start/end), parallelogram (I/O).
  - architecture: rect, group (khung nhóm), + nhãn dịch vụ.

Lưu theo pattern hiện tại: mỗi thao tác gọi REST riêng (optimistic update local
rồi gọi create/update/delete node/edge).

### Views (`src/views/diagrams/`)
- `list.ejs` — grid card mọi type, mỗi card có **badge/icon theo type**; nút
  "Tạo mới" mở picker chọn type → nhập tên → tạo → mở đúng editor.
- `canvas.ejs` — khung editor chung; nạp bundle theo `type`. Mindmap có thể giữ
  view `canvas` cũ hoặc hợp nhất bằng nhánh điều kiện theo type.
- Sidebar (`partials/sidebar.ejs`): đổi nhãn "Mindmaps" → "Sơ đồ" (Diagrams),
  giữ điều kiện chỉ hiện khi có `activeProjectId`.

### CSS
- `src/public/css/diagram.css` cho hình dạng, khung nhóm, mũi tên, nhãn cạnh;
  tái dùng biến theme sáng/tối hiện có. Giữ `mindmap.css` cho editor mindmap.

## 6. Vị trí & auto-layout
- Mindmap: giữ tidy-tree auto-layout (`mindmap-layout.js`).
- Flowchart/Architecture: **đặt tay** (node luôn có `x`,`y`). Không auto-layout ở
  giai đoạn này. Có thể thêm "auto-arrange" phân tầng đơn giản sau (ngoài phạm vi).

## 7. Kiểm thử & xác minh
Dự án chưa có framework test tự động (không có lệnh test trong CLAUDE.md). Xác minh
bằng cách chạy app thật và kiểm tra end-to-end mỗi luồng:
- Tạo mới từng type từ danh sách → mở đúng editor.
- Flowchart: thêm box nhiều hình dạng, nối mũi tên có nhãn, xóa node → cạnh biến mất.
- Architecture: tạo khung nhóm, đặt box vào nhóm, di chuyển nhóm kéo theo thành viên.
- Undo/redo cho node + edge; export PNG; convert node → task.
- Mindmap cũ vẫn hoạt động y như trước (regression).
- Migration áp dụng không đụng bảng `sessions`; dữ liệu mindmap cũ đọc ra bình thường.

## 8. Rủi ro & lưu ý
- Đổi tên model có thể chạm nhiều file (controller/route/view/JS). Dùng `@@map`
  giữ bảng để giảm rủi ro dữ liệu; đổi tên code làm cẩn thận, chạy app kiểm tra.
- FK `parentId` NoAction: mọi thao tác xóa phải thủ công theo thứ tự, tránh lỗi ràng buộc.
- Giữ redirect từ URL/route `/mindmaps` cũ để không phá bookmark/link hiện có.
```
