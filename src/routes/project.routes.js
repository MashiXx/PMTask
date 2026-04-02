const router = require('express').Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const project = require('../controllers/project.controller');

router.use(isAuthenticated, isAdmin);

router.get('/', project.getProjects);
router.post('/', project.createProject);
router.put('/:id', project.updateProject);
router.delete('/:id', project.deleteProject);

module.exports = router;
