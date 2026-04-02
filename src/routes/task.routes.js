const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const task = require('../controllers/task.controller');

// GET task: open to all (guests can view)
router.get('/:id', task.getTask);

// CUD requires authentication
router.post('/', isAuthenticated, task.createTask);
router.put('/:id', isAuthenticated, task.updateTask);
router.patch('/:id/move', isAuthenticated, task.moveTask);
router.delete('/:id', isAuthenticated, task.deleteTask);

module.exports = router;
