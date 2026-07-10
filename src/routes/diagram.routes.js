const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const dg = require('../controllers/diagram.controller');

router.use(isAuthenticated);

// /api/diagrams
router.get('/', dg.getDiagramsByProject);
router.post('/', dg.createDiagram);
router.get('/:id', dg.getDiagram);
router.put('/:id', dg.updateDiagram);
router.delete('/:id', dg.deleteDiagram);

// /api/diagram-nodes
const nodeRouter = require('express').Router();
nodeRouter.use(isAuthenticated);
nodeRouter.post('/', dg.createNode);
nodeRouter.put('/:id', dg.updateNode);
nodeRouter.delete('/:id', dg.deleteNode);
nodeRouter.post('/:id/convert', dg.convertNode);

// /api/diagram-edges
const edgeRouter = require('express').Router();
edgeRouter.use(isAuthenticated);
edgeRouter.post('/', dg.createEdge);
edgeRouter.put('/:id', dg.updateEdge);
edgeRouter.delete('/:id', dg.deleteEdge);

module.exports = router;
module.exports.nodeRouter = nodeRouter;
module.exports.edgeRouter = edgeRouter;
