const router = require('express').Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const tag = require('../controllers/tag.controller');

router.use(isAuthenticated);

router.get('/', tag.getTagsByProject);
router.post('/', isAdmin, tag.createTag);
router.put('/:id', isAdmin, tag.updateTag);
router.delete('/:id', isAdmin, tag.deleteTag);

module.exports = router;
