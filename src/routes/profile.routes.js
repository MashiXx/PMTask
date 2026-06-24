const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const profile = require('../controllers/profile.controller');
const avatarUpload = require('../config/avatar-upload');

router.use(isAuthenticated);

router.get('/', profile.getProfile);
router.post('/update', profile.updateProfile);
router.post('/password', profile.changePassword);
router.post('/theme', profile.updateTheme);

// Avatar upload — wrap multer to surface friendly size/type errors as a flash
router.post('/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      req.flash('error', err.code === 'LIMIT_FILE_SIZE' ? 'Image too large (max 5 MB)' : (err.message || 'Upload failed'));
      return res.redirect('/profile');
    }
    next();
  });
}, profile.uploadAvatar);
router.post('/avatar/delete', profile.deleteAvatar);

module.exports = router;
