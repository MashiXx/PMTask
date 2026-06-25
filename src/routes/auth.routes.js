const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { isGuest } = require('../middleware/auth');
const passport = require('passport');

// Rate limit for login: max 10 attempts per 15 minutes per IP.
// On limit, redirect back with a styled flash message instead of serving a
// bare plain-text page that breaks out of the app UI.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', req.t('flash.tooManyLoginAttempts'));
    res.redirect('/auth/login');
  },
});

// Rate limit for registration: max 5 per hour per IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', req.t('flash.tooManyRegisterAttempts'));
    res.redirect('/auth/register');
  },
});

router.get('/login', isGuest, auth.getLogin);
router.post('/login', isGuest, loginLimiter, auth.postLogin);
router.get('/register', isGuest, auth.getRegister);
router.post('/register', isGuest, registerLimiter, auth.postRegister);
router.get('/logout', auth.logout);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login', failureFlash: true }),
  (req, res) => {
    req.flash('success', req.t('flash.loggedInWithGoogle'));
    res.redirect('/dashboard');
  }
);

module.exports = router;
