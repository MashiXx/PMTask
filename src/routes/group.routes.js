const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const group = require('../controllers/group.controller');

router.use(isAuthenticated);

router.get('/', group.getGroupsByProject);
router.post('/', group.createGroup);
router.patch('/reorder', group.reorderGroups); // before /:id-style handlers (none here, but explicit)
router.put('/:id', group.updateGroup);
router.delete('/:id', group.deleteGroup);

module.exports = router;
