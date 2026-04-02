const router = require('express').Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const project = require('../controllers/project.controller');

// GET projects page: open to all (guests can browse)
router.get('/', project.getProjects);

// CUD requires admin
router.post('/', isAuthenticated, isAdmin, project.createProject);
router.put('/:id', isAuthenticated, isAdmin, project.updateProject);
router.delete('/:id', isAuthenticated, isAdmin, project.deleteProject);

module.exports = router;
