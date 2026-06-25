const bcrypt = require('bcryptjs');
const passport = require('passport');
const prisma = require('../config/prisma');

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
      req.flash('error', req.t('flash.allFieldsRequired'));
      return res.redirect('/auth/register');
    }
    if (password.length < 6) {
      req.flash('error', req.t('flash.passwordTooShort'));
      return res.redirect('/auth/register');
    }
    if (password !== confirmPassword) {
      req.flash('error', req.t('flash.passwordsMismatch'));
      return res.redirect('/auth/register');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      req.flash('error', req.t('flash.emailAlreadyRegistered'));
      return res.redirect('/auth/register');
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'developer', status: 'pending' },
    });
    req.flash('success', req.t('flash.registrationPending'));
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('flash.somethingWentWrong'));
    res.redirect('/auth/register');
  }
};

exports.postLogin = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    // Unexpected error (e.g. database unreachable). Show a specific message
    // instead of letting it fall through to a generic 500 page.
    if (err) {
      console.error('Login error:', err);
      req.flash('error', req.t('flash.loginServerError'));
      return res.redirect('/auth/login');
    }
    // Authentication failed (bad credentials, pending account, etc.).
    // `info.message` carries the specific reason from the local strategy.
    if (!user) {
      req.flash('error', (info && info.message) || req.t('flash.invalidCredentials'));
      return res.redirect('/auth/login');
    }
    // Success — establish the session.
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Session error during login:', loginErr);
        req.flash('error', req.t('flash.sessionStartFailed'));
        return res.redirect('/auth/login');
      }
      return res.redirect('/dashboard');
    });
  })(req, res, next);
};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) console.error(err);
    req.flash('success', req.t('flash.loggedOut'));
    res.redirect('/auth/login');
  });
};
