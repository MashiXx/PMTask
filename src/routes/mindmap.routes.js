const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const mm = require('../controllers/mindmap.controller');

router.use(isAuthenticated);

// /api/mindmaps
router.get('/', mm.getMindmapsByProject);
router.post('/', mm.createMindmap);
router.get('/:id', mm.getMindmap);
router.put('/:id', mm.updateMindmap);
router.delete('/:id', mm.deleteMindmap);

// /api/mindmap-nodes
const nodeRouter = require('express').Router();
nodeRouter.use(isAuthenticated);
nodeRouter.post('/', mm.createNode);
nodeRouter.put('/:id', mm.updateNode);
nodeRouter.delete('/:id', mm.deleteNode);
nodeRouter.post('/:id/convert', mm.convertNode);

// /api/mindmap-edges
const edgeRouter = require('express').Router();
edgeRouter.use(isAuthenticated);
edgeRouter.post('/', mm.createEdge);
edgeRouter.put('/:id', mm.updateEdge);
edgeRouter.delete('/:id', mm.deleteEdge);

module.exports = router;
module.exports.nodeRouter = nodeRouter;
module.exports.edgeRouter = edgeRouter;
