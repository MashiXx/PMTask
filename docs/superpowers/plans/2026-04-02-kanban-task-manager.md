# Kanban Task Manager - Full SSR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing React Kanban UI (design.txt) into a fully functional SSR web application with authentication, CRUD, drag-and-drop, and persistent database.

**Architecture:** Express.js MVC with EJS templates for server-side rendering. Prisma ORM with SQLite for persistence. Passport.js for session-based auth (local + Google OAuth). The dark-theme Kanban UI from design.txt is faithfully recreated in EJS + vanilla CSS/JS. Drag-and-drop via SortableJS. AJAX endpoints for task operations to avoid full page reloads.

**Tech Stack:** Node.js, Express, EJS, SQLite, Prisma ORM, Passport.js, bcrypt, express-session, SortableJS, connect-flash

---

## File Structure

```
PMTask/
  package.json
  .env
  .env.example
  .gitignore
  prisma/
    schema.prisma
    seed.js
  src/
    app.js                    # Express app setup, middleware, routes
    server.js                 # Entry point - starts server
    config/
      passport.js             # Passport strategies (local + Google)
      session.js              # Session configuration
    middleware/
      auth.js                 # isAuthenticated, isGuest guards
    routes/
      auth.routes.js          # /auth/login, /auth/register, /auth/google, /auth/logout
      dashboard.routes.js     # /dashboard (main kanban view)
      task.routes.js          # /api/tasks CRUD + move
      project.routes.js       # /api/projects CRUD
    controllers/
      auth.controller.js      # Register, login, logout logic
      dashboard.controller.js # Render dashboard with tasks/stats
      task.controller.js      # CRUD + move task between columns
      project.controller.js   # CRUD projects
    views/
      layout.ejs              # Base HTML layout (head, scripts, dark theme CSS)
      partials/
        sidebar.ejs           # Sidebar: logo, nav, projects, user profile
        header.ejs            # Topbar: search, filter, notifications, new task btn
        stats.ejs             # Stats cards row
        sprint.ejs            # Sprint progress bar
        kanban.ejs            # Kanban board (4 columns + task cards)
        task-card.ejs         # Single task card partial
        modals/
          task-modal.ejs      # Create/Edit task modal
          delete-modal.ejs    # Delete confirmation modal
      auth/
        login.ejs             # Login page
        register.ejs          # Register page
      dashboard.ejs           # Main dashboard (includes partials)
    public/
      css/
        main.css              # All styles (dark theme from design.txt)
        auth.css              # Auth pages styles
      js/
        kanban.js             # Drag-and-drop + task CRUD (fetch API)
        search.js             # Client-side search/filter
        modal.js              # Modal open/close logic
```

---

## Task 1: Project Initialization & Prisma Schema

**Files:**
- Create: `package.json`
- Create: `.env`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `prisma/schema.prisma`
- Create: `src/server.js`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Users/mashi/mashicode/PMTask
npm init -y
npm install express ejs prisma @prisma/client passport passport-local passport-google-oauth20 express-session connect-flash bcryptjs dotenv method-override
npm install -D nodemon
```

- [ ] **Step 2: Create .gitignore**

```gitignore
node_modules/
.env
prisma/*.db
prisma/*.db-journal
.DS_Store
```

- [ ] **Step 3: Create .env.example and .env**

`.env.example`:
```
DATABASE_URL="file:./dev.db"
SESSION_SECRET="your-session-secret-here"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
PORT=3000
```

`.env` (same but with a real session secret):
```
DATABASE_URL="file:./dev.db"
SESSION_SECRET="pmtask-secret-key-change-in-production-2026"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
PORT=3000
```

- [ ] **Step 4: Create Prisma schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  password  String?
  googleId  String?  @unique
  avatar    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tasks     Task[]
  projects  Project[]
  assignedTasks TaskAssignee[]
}

model Project {
  id        Int      @id @default(autoincrement())
  name      String
  color     String   @default("#6C63FF")
  userId    Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks     Task[]
}

model Task {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  priority    String   @default("medium")
  status      String   @default("todo")
  progress    Int      @default(0)
  dueDate     String?
  starred     Boolean  @default(false)
  position    Int      @default(0)
  projectId   Int
  createdById Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy   User     @relation(fields: [createdById], references: [id])
  tags        TaskTag[]
  assignees   TaskAssignee[]
}

model Tag {
  id    Int     @id @default(autoincrement())
  name  String  @unique
  color String  @default("#6C63FF")

  tasks TaskTag[]
}

model TaskTag {
  taskId Int
  tagId  Int

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tag    Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([taskId, tagId])
}

model TaskAssignee {
  taskId Int
  userId Int

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([taskId, userId])
}
```

- [ ] **Step 5: Run Prisma migration**

```bash
npx prisma migrate dev --name init
```

Expected: SQLite database created at `prisma/dev.db` with all tables.

- [ ] **Step 6: Create minimal server.js to verify setup**

`src/server.js`:
```javascript
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('PMTask is running'));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
```

- [ ] **Step 7: Update package.json scripts**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "seed": "node prisma/seed.js"
  }
}
```

- [ ] **Step 8: Verify server starts**

```bash
npm run dev
```

Expected: "Server running on http://localhost:3000"

- [ ] **Step 9: Initialize git and commit**

```bash
git init
git add -A
git commit -m "feat: project init with Prisma schema and Express server"
```

---

## Task 2: Express App Setup (MVC, Sessions, Flash)

**Files:**
- Create: `src/app.js`
- Modify: `src/server.js`
- Create: `src/config/session.js`
- Create: `src/views/layout.ejs`

- [ ] **Step 1: Create session config**

`src/config/session.js`:
```javascript
const session = require('express-session');

module.exports = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
  },
});
```

- [ ] **Step 2: Create app.js with all middleware**

`src/app.js`:
```javascript
const express = require('express');
const path = require('path');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const sessionConfig = require('./config/session');
const passport = require('passport');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Method override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// Session
app.use(sessionConfig);

// Passport
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Flash messages
app.use(flash());

// Global template variables
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Routes (will be added in subsequent tasks)
app.use('/auth', require('./routes/auth.routes'));
app.use('/dashboard', require('./routes/dashboard.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/projects', require('./routes/project.routes'));

// Root redirect
app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

module.exports = app;
```

- [ ] **Step 3: Update server.js to use app.js**

`src/server.js`:
```javascript
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PMTask running on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Create base layout.ejs**

`src/views/layout.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PMTask - <%= typeof title !== 'undefined' ? title : 'Task Manager' %></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
  <% if (typeof extraCss !== 'undefined') { %>
    <link rel="stylesheet" href="/css/<%= extraCss %>">
  <% } %>
</head>
<body>
  <%- body %>
  <% if (typeof extraJs !== 'undefined') { %>
    <script src="/js/<%= extraJs %>"></script>
  <% } %>
</body>
</html>
```

Note: We use `<%- body %>` — each page will define its own content. We'll use `express-ejs-layouts` or inline includes. For simplicity, each view will include layout via `<%- include() %>`.

**Actually, simpler approach — no layout engine needed.** Each view uses `<%- include('../partials/...') %>` directly. Update `layout.ejs` to be a wrapper:

`src/views/layout.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PMTask - <%= typeof title !== 'undefined' ? title : 'Task Manager' %></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <!-- Flash messages -->
  <% if (success && success.length > 0) { %>
    <div class="flash flash-success"><%= success[0] %></div>
  <% } %>
  <% if (error && error.length > 0) { %>
    <div class="flash flash-error"><%= error[0] %></div>
  <% } %>
```

This gets complex. Let's just have each EJS page be self-contained, including head/foot partials:

`src/views/partials/head.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PMTask - <%= typeof title !== 'undefined' ? title : 'Task Manager' %></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
<% if (typeof success !== 'undefined' && success && success.length > 0) { %>
  <div class="flash flash-success" onclick="this.remove()"><%= success[0] %></div>
<% } %>
<% if (typeof error !== 'undefined' && error && error.length > 0) { %>
  <div class="flash flash-error" onclick="this.remove()"><%= error[0] %></div>
<% } %>
```

`src/views/partials/foot.ejs`:
```html
</body>
</html>
```

- [ ] **Step 5: Create stub route files so app.js doesn't crash**

Create these 4 stub files:

`src/routes/auth.routes.js`:
```javascript
const router = require('express').Router();
router.get('/login', (req, res) => res.send('Login page'));
router.get('/register', (req, res) => res.send('Register page'));
module.exports = router;
```

`src/routes/dashboard.routes.js`:
```javascript
const router = require('express').Router();
router.get('/', (req, res) => res.send('Dashboard'));
module.exports = router;
```

`src/routes/task.routes.js`:
```javascript
const router = require('express').Router();
module.exports = router;
```

`src/routes/project.routes.js`:
```javascript
const router = require('express').Router();
module.exports = router;
```

- [ ] **Step 6: Create stub passport config**

`src/config/passport.js`:
```javascript
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Serialize/deserialize
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});
```

- [ ] **Step 7: Verify server starts with full middleware stack**

```bash
npm run dev
```

Expected: Server starts without errors. Visiting `http://localhost:3000/auth/login` shows "Login page".

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Express app setup with sessions, passport stub, EJS partials"
```

---

## Task 3: Authentication (Register, Login, Logout)

**Files:**
- Modify: `src/config/passport.js`
- Create: `src/middleware/auth.js`
- Create: `src/controllers/auth.controller.js`
- Modify: `src/routes/auth.routes.js`
- Create: `src/views/auth/login.ejs`
- Create: `src/views/auth/register.ejs`
- Create: `src/public/css/auth.css`

- [ ] **Step 1: Create auth middleware**

`src/middleware/auth.js`:
```javascript
module.exports = {
  isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash('error', 'Please log in first');
    res.redirect('/auth/login');
  },
  isGuest(req, res, next) {
    if (!req.isAuthenticated()) return next();
    res.redirect('/dashboard');
  },
};
```

- [ ] **Step 2: Configure Passport local strategy**

`src/config/passport.js`:
```javascript
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Local strategy
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.password) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google strategy (only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              avatar: profile.photos?.[0]?.value,
            },
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// Serialize/deserialize
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});
```

- [ ] **Step 3: Create auth controller**

`src/controllers/auth.controller.js`:
```javascript
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getLogin = (req, res) => {
  res.render('auth/login', { title: 'Login' });
};

exports.getRegister = (req, res) => {
  res.render('auth/register', { title: 'Register' });
};

exports.postRegister = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      req.flash('error', 'All fields are required');
      return res.redirect('/auth/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters');
      return res.redirect('/auth/register');
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/auth/register');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      req.flash('error', 'Email already registered');
      return res.redirect('/auth/register');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Create a default project for the new user
    await prisma.project.create({
      data: { name: 'My Project', color: '#6C63FF', userId: user.id },
    });

    req.login(user, (err) => {
      if (err) {
        req.flash('error', 'Registration succeeded but login failed');
        return res.redirect('/auth/login');
      }
      req.flash('success', 'Welcome to PMTask!');
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong');
    res.redirect('/auth/register');
  }
};

exports.postLogin = (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: true,
  })(req, res, next);
};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) console.error(err);
    req.flash('success', 'Logged out successfully');
    res.redirect('/auth/login');
  });
};
```

- [ ] **Step 4: Create auth routes**

`src/routes/auth.routes.js`:
```javascript
const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { isGuest } = require('../middleware/auth');
const passport = require('passport');

router.get('/login', isGuest, auth.getLogin);
router.post('/login', isGuest, auth.postLogin);
router.get('/register', isGuest, auth.getRegister);
router.post('/register', isGuest, auth.postRegister);
router.get('/logout', auth.logout);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login', failureFlash: true }),
  (req, res) => {
    req.flash('success', 'Logged in with Google');
    res.redirect('/dashboard');
  }
);

module.exports = router;
```

- [ ] **Step 5: Create auth.css**

`src/public/css/auth.css`:
```css
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #08080F;
  font-family: 'Syne', sans-serif;
}

.auth-card {
  background: #0F0F1A;
  border: 1px solid #1E1E30;
  border-radius: 16px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
}

.auth-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;
  justify-content: center;
}

.auth-logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6C63FF, #00D9FF);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(108,99,255,0.4);
  color: white;
  font-size: 16px;
}

.auth-logo-text {
  font-weight: 800;
  font-size: 20px;
  color: #E8E8FF;
  letter-spacing: -0.02em;
}

.auth-title {
  font-size: 22px;
  font-weight: 700;
  color: #E8E8FF;
  margin-bottom: 8px;
  text-align: center;
}

.auth-subtitle {
  font-size: 13px;
  color: #6B6B8E;
  margin-bottom: 28px;
  text-align: center;
  font-family: 'DM Mono', monospace;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #6B6B8E;
  margin-bottom: 6px;
  font-family: 'DM Mono', monospace;
  letter-spacing: 0.04em;
}

.form-group input {
  width: 100%;
  padding: 10px 14px;
  background: #151522;
  border: 1px solid #1E1E30;
  border-radius: 8px;
  color: #E8E8FF;
  font-size: 13px;
  font-family: 'DM Mono', monospace;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus {
  border-color: #2A2A40;
}

.form-group input::placeholder {
  color: #3D3D58;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #6C63FF, #5855D6);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Syne', sans-serif;
  box-shadow: 0 4px 16px rgba(108,99,255,0.35);
  transition: all 0.2s;
  margin-top: 8px;
}

.btn-primary:hover {
  box-shadow: 0 6px 24px rgba(108,99,255,0.5);
  transform: translateY(-1px);
}

.btn-google {
  width: 100%;
  padding: 12px;
  background: #151522;
  border: 1px solid #1E1E30;
  border-radius: 8px;
  color: #E8E8FF;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Syne', sans-serif;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.btn-google:hover {
  border-color: #2A2A40;
  background: #1C1C2E;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #1E1E30;
}

.auth-divider span {
  font-size: 11px;
  color: #3D3D58;
  font-family: 'DM Mono', monospace;
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 13px;
  color: #6B6B8E;
}

.auth-footer a {
  color: #6C63FF;
  text-decoration: none;
  font-weight: 600;
}

.auth-footer a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 6: Create login.ejs**

`src/views/auth/login.ejs`:
```html
<%- include('../partials/head', { title: 'Login' }) %>
<link rel="stylesheet" href="/css/auth.css">

<div class="auth-container">
  <div class="auth-card">
    <div class="auth-logo">
      <div class="auth-logo-icon">&#10024;</div>
      <span class="auth-logo-text">PMTask</span>
    </div>

    <h1 class="auth-title">Welcome back</h1>
    <p class="auth-subtitle">Sign in to your workspace</p>

    <form action="/auth/login" method="POST">
      <div class="form-group">
        <label>EMAIL</label>
        <input type="email" name="email" placeholder="you@example.com" required>
      </div>
      <div class="form-group">
        <label>PASSWORD</label>
        <input type="password" name="password" placeholder="Enter your password" required>
      </div>
      <button type="submit" class="btn-primary">Sign In</button>
    </form>

    <div class="auth-divider"><span>OR</span></div>
    <a href="/auth/google" class="btn-google">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </a>

    <p class="auth-footer">
      Don't have an account? <a href="/auth/register">Sign up</a>
    </p>
  </div>
</div>

<%- include('../partials/foot') %>
```

- [ ] **Step 7: Create register.ejs**

`src/views/auth/register.ejs`:
```html
<%- include('../partials/head', { title: 'Register' }) %>
<link rel="stylesheet" href="/css/auth.css">

<div class="auth-container">
  <div class="auth-card">
    <div class="auth-logo">
      <div class="auth-logo-icon">&#10024;</div>
      <span class="auth-logo-text">PMTask</span>
    </div>

    <h1 class="auth-title">Create account</h1>
    <p class="auth-subtitle">Start managing your projects</p>

    <form action="/auth/register" method="POST">
      <div class="form-group">
        <label>FULL NAME</label>
        <input type="text" name="name" placeholder="Your name" required>
      </div>
      <div class="form-group">
        <label>EMAIL</label>
        <input type="email" name="email" placeholder="you@example.com" required>
      </div>
      <div class="form-group">
        <label>PASSWORD</label>
        <input type="password" name="password" placeholder="Min 6 characters" required minlength="6">
      </div>
      <div class="form-group">
        <label>CONFIRM PASSWORD</label>
        <input type="password" name="confirmPassword" placeholder="Repeat password" required>
      </div>
      <button type="submit" class="btn-primary">Create Account</button>
    </form>

    <div class="auth-divider"><span>OR</span></div>
    <a href="/auth/google" class="btn-google">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </a>

    <p class="auth-footer">
      Already have an account? <a href="/auth/login">Sign in</a>
    </p>
  </div>
</div>

<%- include('../partials/foot') %>
```

- [ ] **Step 8: Create head.ejs and foot.ejs partials**

`src/views/partials/head.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PMTask - <%= typeof title !== 'undefined' ? title : 'Task Manager' %></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
<% if (typeof success !== 'undefined' && success && success.length > 0) { %>
  <div class="flash flash-success" onclick="this.remove()"><%= success[0] %></div>
<% } %>
<% if (typeof error !== 'undefined' && error && error.length > 0) { %>
  <div class="flash flash-error" onclick="this.remove()"><%= error[0] %></div>
<% } %>
```

`src/views/partials/foot.ejs`:
```html
<script>
  // Auto-dismiss flash messages
  document.querySelectorAll('.flash').forEach(el => {
    setTimeout(() => el.remove(), 4000);
  });
</script>
</body>
</html>
```

- [ ] **Step 9: Verify auth flow works**

```bash
npm run dev
```

Visit `http://localhost:3000/auth/register`, register a user, verify redirect to `/dashboard`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: authentication with Passport local + Google OAuth"
```

---

## Task 4: Main CSS (Dark Theme from design.txt)

**Files:**
- Create: `src/public/css/main.css`

- [ ] **Step 1: Create main.css with full dark theme**

`src/public/css/main.css`:
```css
/* ── RESET & BASE ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #08080F;
  --surface: #0F0F1A;
  --card: #151522;
  --card-hover: #1C1C2E;
  --border: #1E1E30;
  --border-light: #2A2A40;
  --accent: #6C63FF;
  --accent-glow: rgba(108,99,255,0.15);
  --cyan: #00D9FF;
  --coral: #FF5C7A;
  --amber: #FFB347;
  --mint: #00F5A0;
  --text: #E8E8FF;
  --text-muted: #6B6B8E;
  --text-dim: #3D3D58;
  --font-display: 'Syne', sans-serif;
  --font-mono: 'DM Mono', monospace;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-display);
  overflow: hidden;
  height: 100vh;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 99px; }

/* ── ANIMATIONS ── */
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── FLASH MESSAGES ── */
.flash {
  position: fixed;
  top: 16px;
  right: 16px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 9999;
  cursor: pointer;
  animation: fadeSlideIn 0.3s ease;
  font-family: var(--font-mono);
}
.flash-success { background: #00F5A022; border: 1px solid #00F5A044; color: var(--mint); }
.flash-error { background: #FF5C7A22; border: 1px solid #FF5C7A44; color: var(--coral); }

/* ── LAYOUT ── */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── SIDEBAR ── */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

.sidebar-logo {
  padding: 0 18px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-logo-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6C63FF, #00D9FF);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(108,99,255,0.4);
  color: white;
  font-size: 13px;
}

.sidebar-logo-text {
  font-weight: 800;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--text);
}

/* Sidebar nav */
.sidebar-nav { display: flex; flex-direction: column; gap: 1px; }

.nav-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  width: 100%;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-display);
  transition: all 0.15s;
  text-decoration: none;
}
.nav-btn:hover { color: var(--text); background: rgba(108,99,255,0.05); }
.nav-btn.active {
  background: rgba(108,99,255,0.08);
  border-left-color: var(--accent);
  color: var(--text);
  font-weight: 600;
}

/* Sidebar projects */
.sidebar-projects { padding: 20px 18px 10px; }

.sidebar-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  text-transform: uppercase;
  font-family: var(--font-mono);
  margin-bottom: 12px;
}

.project-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 2px;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
}
.project-btn:hover { background: rgba(255,255,255,0.02); }
.project-btn.active { border-color: rgba(108,99,255,0.2); }

.project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.project-name {
  font-size: 12.5px;
  font-family: var(--font-display);
  flex: 1;
  text-align: left;
  color: var(--text-muted);
}
.project-btn.active .project-name { color: var(--text); font-weight: 600; }

.project-count {
  font-size: 10px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

/* Sidebar user */
.sidebar-user {
  margin-top: auto;
  padding: 16px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 9px;
}

.sidebar-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(108,99,255,0.13);
  border: 1.5px solid rgba(108,99,255,0.27);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.sidebar-user-info { flex: 1; min-width: 0; }
.sidebar-user-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sidebar-user-role { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }

.sidebar-settings {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-dim);
  display: flex;
  padding: 4px;
  text-decoration: none;
}
.sidebar-settings:hover { color: var(--text-muted); }

/* ── MAIN CONTENT ── */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── HEADER ── */
.topbar {
  height: 60px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 28px;
  gap: 16px;
  background: var(--surface);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}
.breadcrumb-muted {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.breadcrumb-sep { font-size: 12px; color: var(--text-dim); }
.breadcrumb-current { font-size: 13px; font-weight: 700; color: var(--text); }

.sprint-badge {
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(0,217,255,0.08);
  border: 1px solid rgba(0,217,255,0.2);
  border-radius: 99px;
  font-size: 10px;
  color: var(--cyan);
  font-family: var(--font-mono);
  font-weight: 600;
}

/* Search */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  width: 220px;
  transition: border-color 0.2s;
}
.search-box:focus-within { border-color: var(--border-light); }
.search-box svg { flex-shrink: 0; color: var(--text-muted); }
.search-input {
  background: none;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: var(--text);
  width: 100%;
  font-family: var(--font-mono);
}
.search-input::placeholder { color: var(--text-muted); }

/* View toggle */
.view-toggle {
  display: flex;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.view-btn {
  padding: 7px 10px;
  border: none;
  cursor: pointer;
  background: none;
  color: var(--text-muted);
  transition: all 0.15s;
  display: flex;
  align-items: center;
}
.view-btn.active { background: rgba(108,99,255,0.12); color: var(--accent); }
.view-btn:hover:not(.active) { color: var(--text); }

/* Filter btn */
.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--border-light); color: var(--text); }

/* Notification bell */
.notif-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.15s;
  position: relative;
}
.notif-btn:hover { border-color: var(--border-light); color: var(--text); }
.notif-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--coral);
  border: 1.5px solid var(--surface);
  animation: pulse 2s infinite;
}

/* New task button */
.btn-new-task {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6C63FF, #5855D6);
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  color: white;
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--font-display);
  box-shadow: 0 4px 16px rgba(108,99,255,0.35);
  transition: all 0.2s;
}
.btn-new-task:hover {
  box-shadow: 0 6px 24px rgba(108,99,255,0.5);
  transform: translateY(-1px);
}

/* ── BODY ── */
.dashboard-body {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
}

/* ── STATS CARDS ── */
.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-value {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  font-family: var(--font-display);
  letter-spacing: -0.02em;
}

.stat-label {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.stat-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: var(--mint);
  background: rgba(0,245,160,0.08);
  border-radius: 99px;
  padding: 2px 8px;
  font-family: var(--font-mono);
}

/* ── SPRINT PROGRESS ── */
.sprint-bar {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.sprint-bar-inner { flex: 1; }

.sprint-bar-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sprint-bar-title { font-size: 12px; font-weight: 700; color: var(--text); }
.sprint-bar-dates { font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); }

.sprint-track {
  height: 6px;
  background: var(--border);
  border-radius: 99px;
  overflow: hidden;
}

.sprint-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #6C63FF, #00D9FF);
  box-shadow: 0 0 12px rgba(108,99,255,0.5);
  transition: width 0.8s ease;
}

.sprint-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.sprint-meta span {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.sprint-percent {
  text-align: right;
}
.sprint-percent-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
}
.sprint-percent-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* ── KANBAN BOARD ── */
.kanban-board {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.kanban-column {
  flex: 1;
  min-width: 240px;
  max-width: 300px;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 2px;
}

.column-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-icon { flex-shrink: 0; }

.column-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.column-count {
  border-radius: 99px;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.column-add-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}
.column-add-btn:hover { color: var(--text); }

.column-divider {
  height: 2px;
  border-radius: 99px;
  margin-bottom: 14px;
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 60px;
}

/* ── TASK CARD ── */
.task-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  animation: fadeSlideIn 0.3s ease forwards;
}
.task-card:hover {
  background: var(--card-hover);
  border-color: var(--border-light);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px var(--border-light);
}

/* Sortable.js ghost/drag states */
.task-card.sortable-ghost {
  opacity: 0.4;
}
.task-card.sortable-drag {
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
}

.task-priority-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 12px 0 0 12px;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.task-card:hover .task-priority-line { opacity: 1; }

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.task-priority-badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  gap: 4px;
}

.task-menu-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.2s;
  padding: 2px;
  display: flex;
}
.task-card:hover .task-menu-btn { opacity: 1; }

.task-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-display);
  line-height: 1.4;
  margin: 0 0 10px;
  letter-spacing: -0.01em;
}

.task-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tag-badge {
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  font-family: var(--font-mono);
}

/* Tag colors */
.tag-design { background: #6C63FF22; border: 1px solid #6C63FF88; color: #6C63FFCC; }
.tag-ux { background: #00D9FF22; border: 1px solid #00D9FF88; color: #00D9FFCC; }
.tag-backend { background: #FF5C7A22; border: 1px solid #FF5C7A88; color: #FF5C7ACC; }
.tag-frontend { background: #00F5A022; border: 1px solid #00F5A088; color: #00F5A0CC; }
.tag-devops { background: #FFB34722; border: 1px solid #FFB34788; color: #FFB347CC; }
.tag-security { background: #FF5C7A22; border: 1px solid #FF5C7A88; color: #FF5C7ACC; }
.tag-qa { background: #FFB34722; border: 1px solid #FFB34788; color: #FFB347CC; }
.tag-docs { background: #6B6B8E22; border: 1px solid #6B6B8E88; color: #6B6B8ECC; }

/* Task progress */
.task-progress { margin-bottom: 12px; }
.task-progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.task-progress-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.task-progress-value {
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 700;
}
.task-progress-track {
  height: 3px;
  background: var(--border);
  border-radius: 99px;
  overflow: hidden;
}
.task-progress-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s ease;
}

/* Task footer */
.task-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-assignees {
  display: flex;
  align-items: center;
  padding-left: 6px;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5px;
  font-weight: 700;
  font-family: var(--font-mono);
  margin-left: -6px;
  transition: transform 0.2s;
  border-width: 1.5px;
  border-style: solid;
}
.avatar:hover { transform: scale(1.15); z-index: 2; }

.task-due {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Add task placeholder */
.add-task-btn {
  background: none;
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 12px;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
  margin-top: 2px;
  width: 100%;
}
.add-task-btn:hover {
  border-color: var(--border-light);
  color: var(--text-muted);
}

/* ── MODAL ── */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal-overlay.active { display: flex; }

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 480px;
  animation: fadeSlideIn 0.2s ease;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 20px;
}

.modal .form-group {
  margin-bottom: 16px;
}

.modal .form-group label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.modal .form-group input,
.modal .form-group select,
.modal .form-group textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  font-family: var(--font-mono);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.modal .form-group input:focus,
.modal .form-group select:focus,
.modal .form-group textarea:focus {
  border-color: var(--border-light);
}

.modal .form-group select { cursor: pointer; }
.modal .form-group select option { background: var(--card); }

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn-cancel {
  padding: 9px 18px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  font-family: var(--font-display);
  transition: all 0.15s;
}
.btn-cancel:hover { border-color: var(--border-light); color: var(--text); }

.btn-submit {
  padding: 9px 18px;
  background: linear-gradient(135deg, #6C63FF, #5855D6);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-display);
  box-shadow: 0 4px 16px rgba(108,99,255,0.35);
  transition: all 0.2s;
}
.btn-submit:hover {
  box-shadow: 0 6px 24px rgba(108,99,255,0.5);
}

.btn-delete {
  padding: 9px 18px;
  background: rgba(255,92,122,0.1);
  border: 1px solid rgba(255,92,122,0.3);
  border-radius: 8px;
  color: var(--coral);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-display);
  transition: all 0.15s;
}
.btn-delete:hover { background: rgba(255,92,122,0.2); }

/* ── TASK MENU DROPDOWN ── */
.task-menu {
  display: none;
  position: absolute;
  top: 36px;
  right: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  z-index: 100;
  min-width: 120px;
}
.task-menu.active { display: block; }

.task-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  transition: all 0.15s;
}
.task-menu-item:hover { background: var(--card); color: var(--text); }
.task-menu-item.danger { color: var(--coral); }
.task-menu-item.danger:hover { background: rgba(255,92,122,0.1); }

/* ── TAGS INPUT ── */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-checkbox {
  display: none;
}
.tag-label {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text-muted);
  transition: all 0.15s;
}
.tag-checkbox:checked + .tag-label {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(108,99,255,0.1);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: complete dark theme CSS from design"
```

---

## Task 5: Dashboard View (Sidebar + Header + Stats + Sprint + Kanban)

**Files:**
- Create: `src/controllers/dashboard.controller.js`
- Modify: `src/routes/dashboard.routes.js`
- Create: `src/views/dashboard.ejs`
- Create: `src/views/partials/sidebar.ejs`
- Create: `src/views/partials/header.ejs`
- Create: `src/views/partials/stats.ejs`
- Create: `src/views/partials/sprint.ejs`
- Create: `src/views/partials/kanban.ejs`
- Create: `src/views/partials/task-card.ejs`

- [ ] **Step 1: Create dashboard controller**

`src/controllers/dashboard.controller.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.query.project ? parseInt(req.query.project) : null;

    // Get user's projects
    const projects = await prisma.project.findMany({
      where: { userId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Use first project if none selected
    const activeProjectId = projectId || (projects[0]?.id ?? null);

    // Get tasks for active project, grouped by status
    let tasks = { todo: [], inprogress: [], review: [], done: [] };

    if (activeProjectId) {
      const allTasks = await prisma.task.findMany({
        where: { projectId: activeProjectId },
        include: {
          tags: { include: { tag: true } },
          assignees: { include: { user: true } },
        },
        orderBy: { position: 'asc' },
      });

      for (const task of allTasks) {
        if (tasks[task.status]) {
          tasks[task.status].push(task);
        }
      }
    }

    // Stats
    const allProjectTasks = activeProjectId
      ? await prisma.task.count({ where: { projectId: activeProjectId } })
      : 0;
    const inProgressCount = tasks.inprogress.length;
    const doneCount = tasks.done.length;
    const totalCount = Object.values(tasks).flat().length;

    // Overdue count (tasks with dueDate in the past and not done)
    const today = new Date().toISOString().split('T')[0];
    const overdueCount = Object.values(tasks)
      .flat()
      .filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;

    // Sprint progress
    const sprintProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const activeProject = projects.find(p => p.id === activeProjectId);

    res.render('dashboard', {
      title: 'Dashboard',
      projects,
      activeProjectId,
      activeProject,
      tasks,
      stats: {
        total: totalCount,
        inProgress: inProgressCount,
        completed: doneCount,
        overdue: overdueCount,
      },
      sprintProgress,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load dashboard');
    res.redirect('/');
  }
};
```

- [ ] **Step 2: Update dashboard routes**

`src/routes/dashboard.routes.js`:
```javascript
const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const dashboard = require('../controllers/dashboard.controller');

router.get('/', isAuthenticated, dashboard.getDashboard);

module.exports = router;
```

- [ ] **Step 3: Create sidebar.ejs**

`src/views/partials/sidebar.ejs`:
```html
<aside class="sidebar">
  <!-- Logo -->
  <div class="sidebar-logo">
    <div class="sidebar-logo-icon">&#10024;</div>
    <span class="sidebar-logo-text">PMTask</span>
  </div>

  <!-- Nav -->
  <nav class="sidebar-nav">
    <a href="/dashboard" class="nav-btn active">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Projects
    </a>
  </nav>

  <!-- Projects -->
  <div class="sidebar-projects">
    <p class="sidebar-section-title">PROJECTS</p>
    <% projects.forEach(p => { %>
      <a href="/dashboard?project=<%= p.id %>" class="project-btn <%= p.id === activeProjectId ? 'active' : '' %>" style="<%= p.id === activeProjectId ? 'background:' + p.color + '12;' : '' %>">
        <span class="project-dot" style="background: <%= p.color %>; box-shadow: 0 0 6px <%= p.color %>55;"></span>
        <span class="project-name"><%= p.name %></span>
        <span class="project-count"><%= p._count.tasks %></span>
      </a>
    <% }) %>
  </div>

  <!-- User -->
  <div class="sidebar-user">
    <div class="sidebar-avatar"><%= currentUser.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase() %></div>
    <div class="sidebar-user-info">
      <p class="sidebar-user-name"><%= currentUser.name %></p>
      <p class="sidebar-user-role">Member</p>
    </div>
    <a href="/auth/logout" class="sidebar-settings" title="Logout">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </a>
  </div>
</aside>
```

- [ ] **Step 4: Create header.ejs**

`src/views/partials/header.ejs`:
```html
<header class="topbar">
  <!-- Breadcrumb -->
  <div class="breadcrumb">
    <span class="breadcrumb-muted">Projects</span>
    <span class="breadcrumb-sep">&#8250;</span>
    <span class="breadcrumb-current"><%= activeProject ? activeProject.name : 'No Project' %></span>
  </div>

  <!-- Search -->
  <div class="search-box">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input class="search-input" type="text" id="searchInput" placeholder="Search tasks..." autocomplete="off">
  </div>

  <!-- Filter -->
  <button class="filter-btn" id="filterBtn">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
    Filter
  </button>

  <!-- Bell -->
  <div style="position:relative">
    <button class="notif-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    </button>
    <% if (stats.overdue > 0) { %><span class="notif-dot"></span><% } %>
  </div>

  <!-- New Task -->
  <button class="btn-new-task" onclick="openTaskModal()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    New Task
  </button>
</header>
```

- [ ] **Step 5: Create stats.ejs**

`src/views/partials/stats.ejs`:
```html
<div class="stats-row">
  <!-- Total Tasks -->
  <div class="stat-card">
    <div class="stat-icon" style="background: rgba(108,99,255,0.08); border: 1px solid rgba(108,99,255,0.2);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
    </div>
    <div>
      <p class="stat-value"><%= stats.total %></p>
      <p class="stat-label">Total Tasks</p>
    </div>
  </div>

  <!-- In Progress -->
  <div class="stat-card">
    <div class="stat-icon" style="background: rgba(0,217,255,0.08); border: 1px solid rgba(0,217,255,0.2);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D9FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <div>
      <p class="stat-value"><%= stats.inProgress %></p>
      <p class="stat-label">In Progress</p>
    </div>
  </div>

  <!-- Completed -->
  <div class="stat-card">
    <div class="stat-icon" style="background: rgba(0,245,160,0.08); border: 1px solid rgba(0,245,160,0.2);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00F5A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    </div>
    <div>
      <p class="stat-value"><%= stats.completed %></p>
      <p class="stat-label">Completed</p>
    </div>
    <span class="stat-badge">+2 this week</span>
  </div>

  <!-- Overdue -->
  <div class="stat-card">
    <div class="stat-icon" style="background: rgba(255,92,122,0.08); border: 1px solid rgba(255,92,122,0.2);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5C7A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.65 4.98l5.37 5.37a2 2 0 0 1 0 2.83L14.65 19a2 2 0 0 1-2.83 0L4.98 14.65a2 2 0 0 1 0-2.83L10.35 5a2 2 0 0 1 2.83 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div>
      <p class="stat-value"><%= stats.overdue %></p>
      <p class="stat-label">Overdue</p>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Create sprint.ejs**

`src/views/partials/sprint.ejs`:
```html
<div class="sprint-bar">
  <div class="sprint-bar-inner">
    <div class="sprint-bar-header">
      <span class="sprint-bar-title">Sprint Progress</span>
      <span class="sprint-bar-dates">Current Sprint</span>
    </div>
    <div class="sprint-track">
      <div class="sprint-fill" style="width: <%= sprintProgress %>%"></div>
    </div>
    <div class="sprint-meta">
      <span>Done: <%= stats.completed %></span>
      <span>Progress: <%= stats.inProgress %></span>
      <span>Overdue: <%= stats.overdue %></span>
    </div>
  </div>
  <div class="sprint-percent">
    <p class="sprint-percent-value"><%= sprintProgress %>%</p>
    <p class="sprint-percent-label">completed</p>
  </div>
</div>
```

- [ ] **Step 7: Create task-card.ejs**

`src/views/partials/task-card.ejs`:
```html
<%
  const priorityColors = { high: '#FF5C7A', medium: '#FFB347', low: '#00F5A0' };
  const priorityLabels = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
  const pColor = priorityColors[task.priority] || '#FFB347';
  const pLabel = priorityLabels[task.priority] || 'MEDIUM';

  const progressColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347';

  const tagClasses = {
    'Design': 'tag-design', 'UX': 'tag-ux', 'Backend': 'tag-backend',
    'Frontend': 'tag-frontend', 'DevOps': 'tag-devops', 'Security': 'tag-security',
    'QA': 'tag-qa', 'Docs': 'tag-docs'
  };

  const avatarColors = ['#6C63FF', '#00D9FF', '#FF5C7A', '#00F5A0', '#FFB347'];
%>

<div class="task-card" data-task-id="<%= task.id %>" data-status="<%= task.status %>">
  <div class="task-priority-line" style="background: <%= pColor %>"></div>

  <!-- Header -->
  <div class="task-header">
    <span class="task-priority-badge" style="color: <%= pColor %>">
      <%= pLabel %>
    </span>
    <button class="task-menu-btn" onclick="event.stopPropagation(); toggleTaskMenu(<%= task.id %>)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    </button>
  </div>

  <!-- Menu dropdown -->
  <div class="task-menu" id="menu-<%= task.id %>">
    <button class="task-menu-item" onclick="openEditModal(<%= task.id %>)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </button>
    <button class="task-menu-item danger" onclick="deleteTask(<%= task.id %>)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete
    </button>
  </div>

  <!-- Title -->
  <p class="task-title"><%= task.title %></p>

  <!-- Tags -->
  <div class="task-tags">
    <% task.tags.forEach(tt => { %>
      <span class="tag-badge <%= tagClasses[tt.tag.name] || '' %>"><%= tt.tag.name %></span>
    <% }) %>
  </div>

  <!-- Progress -->
  <% if (task.progress > 0) { %>
    <div class="task-progress">
      <div class="task-progress-header">
        <span class="task-progress-label">Progress</span>
        <span class="task-progress-value" style="color: <%= progressColor %>"><%= task.progress %>%</span>
      </div>
      <div class="task-progress-track">
        <div class="task-progress-fill" style="width: <%= task.progress %>%; background: <%= progressColor %>; <%= task.progress === 100 ? 'box-shadow: 0 0 8px #00F5A055;' : '' %>"></div>
      </div>
    </div>
  <% } %>

  <!-- Footer -->
  <div class="task-footer">
    <div class="task-assignees">
      <% task.assignees.forEach((a, i) => { %>
        <% const aColor = avatarColors[i % avatarColors.length]; %>
        <div class="avatar" style="background: <%= aColor %>22; border-color: <%= aColor %>55; color: <%= aColor %>;" title="<%= a.user.name %>">
          <%= a.user.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase() %>
        </div>
      <% }) %>
    </div>
    <% if (task.dueDate) { %>
      <span class="task-due">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <%= task.dueDate %>
      </span>
    <% } %>
  </div>
</div>
```

- [ ] **Step 8: Create kanban.ejs**

`src/views/partials/kanban.ejs`:
```html
<%
  const columns = [
    { id: 'todo', label: 'To Do', accent: '#6B6B8E', icon: 'circle' },
    { id: 'inprogress', label: 'In Progress', accent: '#6C63FF', icon: 'clock' },
    { id: 'review', label: 'In Review', accent: '#FF5C7A', icon: 'star' },
    { id: 'done', label: 'Completed', accent: '#00F5A0', icon: 'check' },
  ];

  const colIcons = {
    circle: '<circle cx="12" cy="12" r="10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  };
%>

<div class="kanban-board">
  <% columns.forEach(col => { %>
    <div class="kanban-column">
      <!-- Column Header -->
      <div class="column-header">
        <div class="column-title-group">
          <svg class="column-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="<%= col.accent %>" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><%- colIcons[col.icon] %></svg>
          <span class="column-label"><%= col.label %></span>
          <span class="column-count" style="background: <%= col.accent %>22; color: <%= col.accent %>"><%= tasks[col.id].length %></span>
        </div>
        <button class="column-add-btn" onclick="openTaskModal('<%= col.id %>')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- Column Divider -->
      <div class="column-divider" style="background: linear-gradient(90deg, <%= col.accent %>88, transparent)"></div>

      <!-- Tasks -->
      <div class="tasks-list" id="col-<%= col.id %>" data-status="<%= col.id %>">
        <% tasks[col.id].forEach(task => { %>
          <%- include('task-card', { task }) %>
        <% }) %>

        <!-- Add task placeholder -->
        <button class="add-task-btn" onclick="openTaskModal('<%= col.id %>')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add task
        </button>
      </div>
    </div>
  <% }) %>
</div>
```

- [ ] **Step 9: Create dashboard.ejs**

`src/views/dashboard.ejs`:
```html
<%- include('partials/head', { title: 'Dashboard' }) %>

<div class="app-layout">
  <%- include('partials/sidebar') %>

  <main class="main-content">
    <%- include('partials/header') %>

    <div class="dashboard-body">
      <%- include('partials/stats') %>
      <%- include('partials/sprint') %>
      <%- include('partials/kanban') %>
    </div>
  </main>
</div>

<!-- Task Modal -->
<%- include('partials/modals/task-modal') %>
<%- include('partials/modals/delete-modal') %>

<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
<script src="/js/modal.js"></script>
<script src="/js/kanban.js"></script>
<script src="/js/search.js"></script>

<%- include('partials/foot') %>
```

- [ ] **Step 10: Verify dashboard renders**

```bash
npm run dev
```

Register/login, then visit `/dashboard`. Should render the full dark-theme Kanban UI.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: dashboard view with sidebar, stats, sprint, kanban board"
```

---

## Task 6: Task CRUD API + Modals

**Files:**
- Create: `src/controllers/task.controller.js`
- Modify: `src/routes/task.routes.js`
- Create: `src/views/partials/modals/task-modal.ejs`
- Create: `src/views/partials/modals/delete-modal.ejs`
- Create: `src/public/js/modal.js`

- [ ] **Step 1: Create task controller**

`src/controllers/task.controller.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createTask = async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, progress, tags, projectId } = req.body;

    const maxPos = await prisma.task.aggregate({
      where: { projectId: parseInt(projectId), status: status || 'todo' },
      _max: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || 'medium',
        status: status || 'todo',
        dueDate: dueDate || null,
        progress: parseInt(progress) || 0,
        position: (maxPos._max.position || 0) + 1,
        projectId: parseInt(projectId),
        createdById: req.user.id,
      },
    });

    // Handle tags
    if (tags && tags.length > 0) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.taskTag.create({
          data: { taskId: task.id, tagId: tag.id },
        });
      }
    }

    // Assign to creator
    await prisma.taskAssignee.create({
      data: { taskId: task.id, userId: req.user.id },
    });

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, dueDate, progress, tags } = req.body;

    const task = await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description: description || null,
        priority,
        dueDate: dueDate || null,
        progress: parseInt(progress) || 0,
      },
    });

    // Update tags: remove old, add new
    if (tags !== undefined) {
      await prisma.taskTag.deleteMany({ where: { taskId: task.id } });
      const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.taskTag.create({
          data: { taskId: task.id, tagId: tag.id },
        });
      }
    }

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

exports.moveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, position } = req.body;

    await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        status,
        position: parseInt(position),
        // Auto-set progress to 100 when moved to done
        ...(status === 'done' ? { progress: 100 } : {}),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.task.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await prisma.task.findUnique({
      where: { id: parseInt(id) },
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get task' });
  }
};
```

- [ ] **Step 2: Update task routes**

`src/routes/task.routes.js`:
```javascript
const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const task = require('../controllers/task.controller');

router.use(isAuthenticated);

router.post('/', task.createTask);
router.get('/:id', task.getTask);
router.put('/:id', task.updateTask);
router.patch('/:id/move', task.moveTask);
router.delete('/:id', task.deleteTask);

module.exports = router;
```

- [ ] **Step 3: Create task-modal.ejs**

`src/views/partials/modals/task-modal.ejs`:
```html
<div class="modal-overlay" id="taskModal">
  <div class="modal">
    <h2 class="modal-title" id="taskModalTitle">New Task</h2>

    <form id="taskForm">
      <input type="hidden" id="taskId" value="">
      <input type="hidden" id="taskProjectId" value="<%= activeProjectId %>">

      <div class="form-group">
        <label>TITLE</label>
        <input type="text" id="taskTitle" placeholder="Task title" required>
      </div>

      <div class="form-group">
        <label>DESCRIPTION</label>
        <textarea id="taskDescription" placeholder="Optional description" rows="2" style="resize:vertical"></textarea>
      </div>

      <div style="display: flex; gap: 12px;">
        <div class="form-group" style="flex:1">
          <label>PRIORITY</label>
          <select id="taskPriority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label>STATUS</label>
          <select id="taskStatus">
            <option value="todo">To Do</option>
            <option value="inprogress">In Progress</option>
            <option value="review">In Review</option>
            <option value="done">Completed</option>
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 12px;">
        <div class="form-group" style="flex:1">
          <label>DUE DATE</label>
          <input type="date" id="taskDueDate">
        </div>
        <div class="form-group" style="flex:1">
          <label>PROGRESS (%)</label>
          <input type="number" id="taskProgress" min="0" max="100" value="0">
        </div>
      </div>

      <div class="form-group">
        <label>TAGS</label>
        <div class="tags-container">
          <% ['Design', 'UX', 'Backend', 'Frontend', 'DevOps', 'Security', 'QA', 'Docs'].forEach(tag => { %>
            <input type="checkbox" class="tag-checkbox" name="tags" value="<%= tag %>" id="tag-<%= tag %>">
            <label class="tag-label" for="tag-<%= tag %>"><%= tag %></label>
          <% }) %>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-cancel" onclick="closeTaskModal()">Cancel</button>
        <button type="submit" class="btn-submit" id="taskSubmitBtn">Create Task</button>
      </div>
    </form>
  </div>
</div>
```

- [ ] **Step 4: Create delete-modal.ejs**

`src/views/partials/modals/delete-modal.ejs`:
```html
<div class="modal-overlay" id="deleteModal">
  <div class="modal" style="max-width: 380px; text-align: center;">
    <h2 class="modal-title">Delete Task</h2>
    <p style="color: var(--text-muted); font-size: 13px; font-family: var(--font-mono); margin-bottom: 24px;">
      Are you sure? This action cannot be undone.
    </p>
    <input type="hidden" id="deleteTaskId" value="">
    <div class="modal-actions" style="justify-content: center;">
      <button class="btn-cancel" onclick="closeDeleteModal()">Cancel</button>
      <button class="btn-delete" onclick="confirmDelete()">Delete</button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Create modal.js**

`src/public/js/modal.js`:
```javascript
// Task Modal
function openTaskModal(status) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('taskSubmitBtn').textContent = 'Create Task';
  document.getElementById('taskId').value = '';
  document.getElementById('taskForm').reset();
  if (status) {
    document.getElementById('taskStatus').value = status;
  }
  modal.classList.add('active');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('active');
}

async function openEditModal(taskId) {
  closeAllMenus();
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const task = await res.json();

    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskSubmitBtn').textContent = 'Save Changes';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskProgress').value = task.progress;

    // Reset tags
    document.querySelectorAll('.tag-checkbox').forEach(cb => cb.checked = false);
    task.tags.forEach(tt => {
      const cb = document.getElementById(`tag-${tt.tag.name}`);
      if (cb) cb.checked = true;
    });

    document.getElementById('taskModal').classList.add('active');
  } catch (err) {
    console.error('Failed to load task:', err);
  }
}

// Task form submit
document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const taskId = document.getElementById('taskId').value;
  const tags = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);

  const data = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    priority: document.getElementById('taskPriority').value,
    status: document.getElementById('taskStatus').value,
    dueDate: document.getElementById('taskDueDate').value,
    progress: document.getElementById('taskProgress').value,
    projectId: document.getElementById('taskProjectId').value,
    tags,
  };

  try {
    const url = taskId ? `/api/tasks/${taskId}` : '/api/tasks';
    const method = taskId ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    closeTaskModal();
    window.location.reload();
  } catch (err) {
    console.error('Failed to save task:', err);
  }
});

// Delete Modal
function deleteTask(taskId) {
  closeAllMenus();
  document.getElementById('deleteTaskId').value = taskId;
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
}

async function confirmDelete() {
  const taskId = document.getElementById('deleteTaskId').value;
  try {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    closeDeleteModal();
    window.location.reload();
  } catch (err) {
    console.error('Failed to delete task:', err);
  }
}

// Task card menus
function toggleTaskMenu(taskId) {
  closeAllMenus();
  const menu = document.getElementById(`menu-${taskId}`);
  if (menu) menu.classList.toggle('active');
}

function closeAllMenus() {
  document.querySelectorAll('.task-menu').forEach(m => m.classList.remove('active'));
}

// Close menus and modals on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-menu-btn') && !e.target.closest('.task-menu')) {
    closeAllMenus();
  }
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: task CRUD API with create/edit/delete modals"
```

---

## Task 7: Drag & Drop Kanban + Client Search

**Files:**
- Create: `src/public/js/kanban.js`
- Create: `src/public/js/search.js`

- [ ] **Step 1: Create kanban.js with SortableJS**

`src/public/js/kanban.js`:
```javascript
// Initialize Sortable on each column
document.querySelectorAll('.tasks-list').forEach(list => {
  new Sortable(list, {
    group: 'kanban',
    animation: 200,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    draggable: '.task-card',
    onEnd: async function(evt) {
      const taskId = evt.item.dataset.taskId;
      const newStatus = evt.to.dataset.status;
      const newIndex = evt.newIndex;

      try {
        await fetch(`/api/tasks/${taskId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, position: newIndex }),
        });

        // Update column counts
        updateColumnCounts();

        // If moved to done, auto-set progress bar to 100%
        if (newStatus === 'done') {
          const progressFill = evt.item.querySelector('.task-progress-fill');
          const progressValue = evt.item.querySelector('.task-progress-value');
          if (progressFill) {
            progressFill.style.width = '100%';
            progressFill.style.background = '#00F5A0';
          }
          if (progressValue) {
            progressValue.textContent = '100%';
            progressValue.style.color = '#00F5A0';
          }
        }
      } catch (err) {
        console.error('Failed to move task:', err);
        // Revert on failure by reloading
        window.location.reload();
      }
    },
  });
});

function updateColumnCounts() {
  document.querySelectorAll('.kanban-column').forEach(col => {
    const list = col.querySelector('.tasks-list');
    const count = list.querySelectorAll('.task-card').length;
    const countBadge = col.querySelector('.column-count');
    if (countBadge) countBadge.textContent = count;
  });
}
```

- [ ] **Step 2: Create search.js**

`src/public/js/search.js`:
```javascript
const searchInput = document.getElementById('searchInput');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.task-card');

    cards.forEach(card => {
      const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
      const tags = Array.from(card.querySelectorAll('.tag-badge'))
        .map(t => t.textContent.toLowerCase()).join(' ');

      const match = !query || title.includes(query) || tags.includes(query);
      card.style.display = match ? '' : 'none';
    });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: drag-and-drop kanban with SortableJS + search"
```

---

## Task 8: Project CRUD API

**Files:**
- Create: `src/controllers/project.controller.js`
- Modify: `src/routes/project.routes.js`

- [ ] **Step 1: Create project controller**

`src/controllers/project.controller.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createProject = async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const project = await prisma.project.create({
      data: {
        name,
        color: color || '#6C63FF',
        userId: req.user.id,
      },
    });

    res.json({ success: true, project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.project.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};
```

- [ ] **Step 2: Update project routes**

`src/routes/project.routes.js`:
```javascript
const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const project = require('../controllers/project.controller');

router.use(isAuthenticated);

router.post('/', project.createProject);
router.delete('/:id', project.deleteProject);

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: project CRUD API"
```

---

## Task 9: Seed Data + Final Polish

**Files:**
- Create: `prisma/seed.js`

- [ ] **Step 1: Create seed script**

`prisma/seed.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.taskAssignee.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Create demo user
  const password = await bcrypt.hash('demo123', 12);
  const user = await prisma.user.create({
    data: { name: 'Anh Nguyen', email: 'demo@pmtask.com', password },
  });

  // Create tags
  const tagData = [
    { name: 'Design', color: '#6C63FF' },
    { name: 'UX', color: '#00D9FF' },
    { name: 'Backend', color: '#FF5C7A' },
    { name: 'Frontend', color: '#00F5A0' },
    { name: 'DevOps', color: '#FFB347' },
    { name: 'Security', color: '#FF5C7A' },
    { name: 'QA', color: '#FFB347' },
    { name: 'Docs', color: '#6B6B8E' },
  ];
  const tags = {};
  for (const t of tagData) {
    tags[t.name] = await prisma.tag.create({ data: t });
  }

  // Create projects (from design)
  const projects = {
    atlas: await prisma.project.create({ data: { name: 'Atlas Platform', color: '#6C63FF', userId: user.id } }),
    mobile: await prisma.project.create({ data: { name: 'Mobile App', color: '#00D9FF', userId: user.id } }),
    data: await prisma.project.create({ data: { name: 'Data Pipeline', color: '#00F5A0', userId: user.id } }),
    marketing: await prisma.project.create({ data: { name: 'Marketing Site', color: '#FF5C7A', userId: user.id } }),
  };

  // Create tasks matching design.txt
  const taskData = [
    // To Do
    { title: 'Redesign onboarding flow', priority: 'high', status: 'todo', tags: ['Design', 'UX'], progress: 0, dueDate: '2026-04-08', position: 0 },
    { title: 'Set up CI/CD pipeline', priority: 'medium', status: 'todo', tags: ['DevOps'], progress: 0, dueDate: '2026-04-10', position: 1 },
    { title: 'Write API documentation', priority: 'low', status: 'todo', tags: ['Docs'], progress: 0, dueDate: '2026-04-12', position: 2 },
    // In Progress
    { title: 'Build authentication module', priority: 'high', status: 'inprogress', tags: ['Backend', 'Security'], progress: 65, dueDate: '2026-04-06', position: 0 },
    { title: 'Dashboard analytics charts', priority: 'medium', status: 'inprogress', tags: ['Frontend'], progress: 40, dueDate: '2026-04-09', position: 1 },
    // In Review
    { title: 'Mobile responsive fixes', priority: 'medium', status: 'review', tags: ['Frontend', 'QA'], progress: 90, dueDate: '2026-04-05', position: 0 },
    { title: 'Performance optimization', priority: 'high', status: 'review', tags: ['Backend'], progress: 85, dueDate: '2026-04-07', position: 1 },
    // Done
    { title: 'Database schema design', priority: 'high', status: 'done', tags: ['Backend'], progress: 100, dueDate: '2026-04-01', position: 0 },
    { title: 'UI component library', priority: 'medium', status: 'done', tags: ['Design', 'Frontend'], progress: 100, dueDate: '2026-04-02', position: 1 },
  ];

  for (const td of taskData) {
    const task = await prisma.task.create({
      data: {
        title: td.title,
        priority: td.priority,
        status: td.status,
        progress: td.progress,
        dueDate: td.dueDate,
        position: td.position,
        projectId: projects.atlas.id,
        createdById: user.id,
      },
    });

    // Attach tags
    for (const tagName of td.tags) {
      await prisma.taskTag.create({
        data: { taskId: task.id, tagId: tags[tagName].id },
      });
    }

    // Assign to user
    await prisma.taskAssignee.create({
      data: { taskId: task.id, userId: user.id },
    });
  }

  console.log('Seed complete!');
  console.log('Login: demo@pmtask.com / demo123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run seed**

```bash
npm run seed
```

Expected: "Seed complete!" with demo account info.

- [ ] **Step 3: Test full app flow**

```bash
npm run dev
```

1. Visit `http://localhost:3000` — should redirect to login
2. Login with `demo@pmtask.com` / `demo123`
3. Dashboard shows all 4 columns with tasks from design
4. Drag a task between columns — verify it moves
5. Click "New Task" — create a task
6. Click task menu — edit and delete
7. Search for a task by title

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed data matching design + final integration"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Project init, Prisma schema, minimal server | None |
| 2 | Express app setup (MVC, sessions, flash) | Task 1 |
| 3 | Authentication (register, login, logout) | Task 2 |
| 4 | Main CSS (dark theme from design) | Task 1 |
| 5 | Dashboard view (all EJS partials) | Tasks 2, 3, 4 |
| 6 | Task CRUD API + Modals | Task 5 |
| 7 | Drag & Drop + Search (client JS) | Task 6 |
| 8 | Project CRUD API | Task 2 |
| 9 | Seed data + Final integration test | All |

**Independent tasks that can run in parallel:** Tasks 3 + 4 (auth and CSS have no dependency on each other). Tasks 6 + 8 (task API and project API are independent).
