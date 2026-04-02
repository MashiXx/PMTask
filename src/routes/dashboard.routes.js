const router = require('express').Router();
const dashboard = require('../controllers/dashboard.controller');

router.get('/', dashboard.getDashboard);

module.exports = router;
