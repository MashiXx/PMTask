const express = require('express');
const path = require('path');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const sessionConfig = require('./config/session');
const passport = require('passport');

const app = express();

// Trust first proxy (needed for express-rate-limit behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      workerSrc: ["'self'", "blob:"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

// Method override
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
  res.locals.userTheme = req.user ? req.user.theme : 'system';
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Routes
app.use('/auth', require('./routes/auth.routes'));
app.use('/dashboard', require('./routes/dashboard.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/projects', require('./routes/project.routes'));
app.use('/api/tags', require('./routes/tag.routes'));
app.use('/api/subtasks', require('./routes/subtask.routes'));
app.use('/projects', require('./routes/project.routes'));
app.use('/projects/:projectId/documents', require('./routes/document.routes'));
app.use('/profile', require('./routes/profile.routes'));
app.use('/admin', require('./routes/admin.routes'));

// Task detail page
const { isAuthenticated } = require('./middleware/auth');
const taskController = require('./controllers/task.controller');
app.get('/tasks/:id', taskController.getTaskPage);

// Root -> dashboard (guests welcome)
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

module.exports = app;
