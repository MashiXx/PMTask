const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const project = require('../controllers/project.controller');

router.use(isAuthenticated);

router.post('/', project.createProject);
router.put('/:id', project.updateProject);
router.delete('/:id', project.deleteProject);

module.exports = router;
