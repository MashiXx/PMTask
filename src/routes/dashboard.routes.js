const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const dashboard = require('../controllers/dashboard.controller');

router.get('/', isAuthenticated, dashboard.getDashboard);

module.exports = router;
