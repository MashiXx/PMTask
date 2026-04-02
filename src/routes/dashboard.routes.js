const router = require('express').Router();
router.get('/', (req, res) => res.send('Dashboard'));
module.exports = router;
