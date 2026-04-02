const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const tag = require('../controllers/tag.controller');

router.use(isAuthenticated);

router.get('/', tag.getTagsByProject);
router.post('/', tag.createTag);
router.put('/:id', tag.updateTag);
router.delete('/:id', tag.deleteTag);

module.exports = router;
