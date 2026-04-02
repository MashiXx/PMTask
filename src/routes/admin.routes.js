const router = require('express').Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

router.use(isAuthenticated, isAdmin);

router.get('/users', admin.getUsers);
router.post('/users', admin.createUser);
router.put('/users/:id', admin.updateUser);
router.delete('/users/:id', admin.deleteUser);

module.exports = router;
