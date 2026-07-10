const router = require('express').Router({ mergeParams: true });
const { isAuthenticated } = require('../middleware/auth');
const dg = require('../controllers/diagram.controller');

router.use(isAuthenticated);
router.get('/', dg.getDiagramsListPage);
router.get('/:diagramId', dg.getDiagramCanvasPage);

module.exports = router;
