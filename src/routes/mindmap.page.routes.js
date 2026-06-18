const router = require('express').Router({ mergeParams: true });
const { isAuthenticated } = require('../middleware/auth');
const mm = require('../controllers/mindmap.controller');

router.use(isAuthenticated);
router.get('/', mm.getMindmapsListPage);
router.get('/:mindmapId', mm.getMindmapCanvasPage);

module.exports = router;
