const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const task = require('../controllers/task.controller');

router.use(isAuthenticated);

router.post('/', task.createTask);
router.get('/:id', task.getTask);
router.put('/:id', task.updateTask);
router.patch('/:id/move', task.moveTask);
router.delete('/:id', task.deleteTask);

module.exports = router;
