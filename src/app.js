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
app.use('/projects', require('./routes/project.routes'));
app.use('/profile', require('./routes/profile.routes'));
app.use('/admin', require('./routes/admin.routes'));

// Task detail page
const { isAuthenticated } = require('./middleware/auth');
const taskController = require('./controllers/task.controller');
app.get('/tasks/:id', isAuthenticated, taskController.getTaskPage);

// Root redirect
app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

module.exports = app;
