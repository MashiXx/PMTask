const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { isGuest } = require('../middleware/auth');
const passport = require('passport');

// Rate limit for login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for registration: max 5 per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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
    req.flash('success', 'Logged in with Google');
    res.redirect('/dashboard');
  }
);

module.exports = router;
