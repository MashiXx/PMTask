const router = require('express').Router();
const dashboard = require('../controllers/dashboard.controller');

router.get('/', dashboard.getDashboard);
router.get('/:projectSlug', dashboard.getDashboard);

module.exports = router;
