const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const comment = require('../controllers/comment.controller');

router.get('/task/:taskId', comment.getComments);
router.post('/task/:taskId', isAuthenticated, comment.createComment);
router.put('/:id', isAuthenticated, comment.updateComment);
router.delete('/:id', isAuthenticated, comment.deleteComment);

module.exports = router;
