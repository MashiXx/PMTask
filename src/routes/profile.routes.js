const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const profile = require('../controllers/profile.controller');

router.use(isAuthenticated);

router.get('/', profile.getProfile);
router.post('/update', profile.updateProfile);
router.post('/password', profile.changePassword);

module.exports = router;
