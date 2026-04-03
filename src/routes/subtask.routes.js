const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const subtask = require('../controllers/subtask.controller');

router.get('/task/:taskId', isAuthenticated, subtask.getSubtasks);
router.post('/task/:taskId', isAuthenticated, subtask.createSubtask);
router.put('/:id', isAuthenticated, subtask.updateSubtask);
router.delete('/:id', isAuthenticated, subtask.deleteSubtask);

module.exports = router;
