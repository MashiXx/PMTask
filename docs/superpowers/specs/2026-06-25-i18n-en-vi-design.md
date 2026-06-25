# Thiết kế: Đa ngôn ngữ Anh/Việt (i18n) cho PMTask

**Ngày:** 2026-06-25
**Trạng thái:** Đã duyệt thiết kế, chờ viết kế hoạch triển khai

## 1. Bối cảnh & Vấn đề

PMTask là app render phía server (Express + EJS + Prisma/MySQL). Hiện tại text giao
diện hầu hết hardcode tiếng Anh trong các file `.ejs` và một số chuỗi trong
`src/public/js/*.js`, nhưng có **lẫn tiếng Việt rải rác** (~163 chỗ trong 13 file,
ví dụ `task-detail.ejs`, `modal.js`, `stats.ejs`). Kết quả: giao diện không thống nhất —
chỗ Anh chỗ Việt.

**Mục tiêu:** Hỗ trợ đầy đủ 2 ngôn ngữ English/Tiếng Việt cho **toàn bộ giao diện**,
người dùng tự đổi trong trang Settings (Profile). Mọi chuỗi người dùng nhìn thấy đều
nhất quán theo ngôn ngữ đã chọn.

## 2. Quyết định đã chốt (từ brainstorming)

- **Phạm vi:** Toàn bộ UI — nav/sidebar, nút, nhãn form, tiêu đề trang, text trong file
  JS, flash messages (success/error), lỗi validation. Thống nhất hoàn toàn EN/VI.
- **Ngôn ngữ mặc định:** Tiếng Anh (`en`) cho người dùng mới và khách.
- **Vị trí đổi ngôn ngữ:** Trong trang Settings/Profile (chỉ người đã đăng nhập).
- **Hướng kỹ thuật:** Custom i18n nhẹ, không thêm dependency, bám đúng pattern của
  tính năng Theme đã có sẵn.

## 3. Kiến trúc tổng quan

```
Request
  → middleware i18n (app.js): xác định lang, gắn res.locals.lang + res.locals.t
  → Controller (flash dùng t())
  → View EJS (<%= t('key') %>, <html lang>)
       └─ head.ejs nhúng window.__I18N__ = { lang, dict(js.*) }
       └─ foot/head load /js/i18n.js → window.t() cho client JS
```

Nguồn dữ liệu dịch: `src/locales/en.json` + `src/locales/vi.json`.
Nguồn sự thật ngôn ngữ: `User.language` (đăng nhập) hoặc cookie `pmtask-lang` (khách).

## 4. Thành phần chi tiết

### 4.1. Lưu trữ & độ ưu tiên ngôn ngữ

- **DB:** Thêm cột `User.language String @default("en")` vào `prisma/schema.prisma` +
  migration. *(Lưu ý: theo memory dự án, `migrate`/`generate` phải chạy dưới WSL,
  không chạy được trên Windows native.)*
- **Cookie:** `pmtask-lang` (Max-Age ~1 năm, `SameSite=Lax`). Dùng cho khách và để
  request kế tiếp render đúng ngôn ngữ ngay từ server (tránh nhấp nháy).
- **Thứ tự quyết định `lang` mỗi request:**
  1. `req.user.language` (nếu đã đăng nhập và hợp lệ)
  2. cookie `pmtask-lang` (nếu hợp lệ)
  3. mặc định `'en'`
- **Validate:** chỉ chấp nhận `['en', 'vi']`; giá trị lạ → ép về `'en'`.
- Cần thêm middleware đọc cookie (`cookie-parser`) **nếu** chưa có. Kiểm tra lại
  `app.js`; nếu chưa có sẵn thì thêm `cookie-parser` (dependency nhỏ, chuẩn Express)
  hoặc tự parse `req.headers.cookie`. Quyết định cuối trong kế hoạch triển khai.

### 4.2. Lõi i18n phía server

- **File locale:** `src/locales/en.json`, `src/locales/vi.json`. Key phẳng, nhóm theo
  tiền tố, ví dụ:
  ```json
  {
    "sidebar.dashboard": "Dashboard",
    "profile.changePassword": "Change Password",
    "flash.profileUpdated": "Profile updated",
    "js.confirmDelete": "Are you sure you want to delete {name}?"
  }
  ```
- **Module `src/config/i18n.js`:**
  - Load cả 2 file một lần khi khởi động.
  - `t(key, lang, vars)` → tra `dict[lang][key]`; thiếu thì fallback `dict['en'][key]`;
    vẫn thiếu thì trả về chính `key` và log cảnh báo ở môi trường dev.
  - Hỗ trợ nội suy biến `{name}` → thay bằng `vars.name`.
  - Export thêm danh sách ngôn ngữ hợp lệ + nhãn hiển thị.

### 4.3. Middleware (app.js)

Bổ sung trong block `res.locals` hiện có (sau khi `req.user` sẵn sàng):

```js
res.locals.lang = resolveLang(req);          // theo thứ tự ở 4.1
res.locals.t = (key, vars) => t(key, res.locals.lang, vars);
```

- `<html lang="<%= lang %>">` trong `head.ejs` dùng biến này.
- Để controller dùng được trong flash, gắn thêm `req.t = res.locals.t` (hoặc helper
  tương đương) trong cùng middleware.

### 4.4. Chuỗi phía client (JS)

- Trong `head.ejs`, nhúng sớm:
  ```html
  <script>window.__I18N__ = { lang: '<%= lang %>', dict: <%- jsDictJSON %> };</script>
  ```
  Chỉ nhúng nhóm key `js.*` để payload gọn (i18n.js cung cấp hàm lọc dict này).
- Thêm `src/public/js/i18n.js` (load trước các script khác trong `foot.ejs`, hoặc cuối
  `head.ejs`): expose `window.t(key, vars)` đọc từ `window.__I18N__`, cùng cơ chế
  fallback/nội suy như server.
- Các file trong `src/public/js/` đổi chuỗi cứng → `t('js....')`.

### 4.5. UI chọn ngôn ngữ (Settings)

- Thêm khối "Language / Ngôn ngữ" trong `profile.ejs`, kiểu thẻ chọn giống khối Theme
  (2 thẻ: **English**, **Tiếng Việt**), highlight thẻ đang active theo `lang`.
- `i18n.js` có hàm `setLanguage(lang)`:
  ```js
  fetch('/profile/language', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ language: lang }) })
    .then(() => location.reload());  // render server-side cần tải lại
  ```
- **Endpoint `profile.updateLanguage`** (mirror `updateTheme`):
  - Validate `language ∈ ['en','vi']` → 400 nếu sai.
  - `prisma.user.update` set `language`.
  - Set cookie `pmtask-lang`.
  - Trả `{ success: true }`.
- **Route:** `router.post('/language', profile.updateLanguage)` trong `profile.routes.js`.

### 4.6. Trích xuất chuỗi (phần việc lớn nhất)

- Quét toàn bộ **28 file `.ejs` + 20 file JS**, gom mọi chuỗi người dùng thấy thành key,
  điền cả EN + VI vào 2 file locale.
- Gồm cả các chỗ tiếng Việt lẫn lộn hiện tại (~163 chỗ) → quy về key thống nhất.
- `title` truyền vào `head.ejs` ở mỗi view (vd `'Dashboard'`, `'Profile'`) → đổi sang
  `t('...')`.
- Flash messages trong controllers (`req.flash('error', 'Failed to ...')`) → `req.t('...')`.
- Quy ước đặt tên key theo trang/khu vực: `sidebar.*`, `profile.*`, `task.*`, `flash.*`,
  `auth.*`, `js.*`, `common.*`...

## 5. Xử lý lỗi & trường hợp biên

- Giá trị `lang` lạ (cookie bị sửa, giá trị cũ) → ép `'en'`.
- Key thiếu → fallback EN → key thô; log cảnh báo ở dev.
- Khách không đổi được ngôn ngữ (trang Settings yêu cầu đăng nhập) → khách luôn thấy
  EN (mặc định). Chấp nhận trong phạm vi này.
- User Google đăng nhập lần đầu: `language` lấy default `'en'`.

## 6. Kế hoạch kiểm thử

- Render thử mỗi trang ở cả 2 ngôn ngữ, không vỡ layout/lỗi template.
- Người dùng mới: mặc định EN.
- Đổi ngôn ngữ trong Settings → reload → toàn bộ UI đổi (cả chuỗi JS, flash).
- Cookie tồn tại sau khi đăng xuất (khách) → vẫn đúng ngôn ngữ đã set khi còn đăng nhập.
- Grep xác minh **không còn chuỗi cứng sót** trong `.ejs`/JS (trừ tên riêng như "PMTask").
- Migration chạy được (dưới WSL) và cột `language` có default đúng.

## 7. Ngoài phạm vi (YAGNI)

- Không dịch nội dung do người dùng tạo (tên task, mô tả, comment, tên dự án...).
- Không thêm ngôn ngữ thứ 3.
- Không thêm pluralization phức tạp (2 ngôn ngữ này không cần).
- Không toggle nhanh ở topbar (đã chốt: chỉ đổi trong Settings).
- Không tự động phát hiện theo trình duyệt (đã chốt: mặc định EN).
