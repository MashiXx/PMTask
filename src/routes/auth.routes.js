const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { isGuest } = require('../middleware/auth');
const passport = require('passport');

router.get('/login', isGuest, auth.getLogin);
router.post('/login', isGuest, auth.postLogin);
router.get('/register', isGuest, auth.getRegister);
router.post('/register', isGuest, auth.postRegister);
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
