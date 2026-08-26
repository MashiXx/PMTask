const prisma = require('../config/prisma');
const { canAccessProject } = require('../utils/access');

// Keeps the left sidebar from changing shape as the user moves around.
//
// partials/sidebar.ejs renders one of two menus: a project menu (Tasks /
// Documents / Diagrams / Notes / Users, under the project switcher) while a
// project is active, and a general menu (Dashboard / Projects / Notes / Users /
// Profile) when none is. Pages that aren't tied to a project -- Notes, Users,
// Profile -- fell into the second branch, so clicking Notes from inside a
// project swapped the whole menu out.
//
// Carrying the project the user was last looking at (dashboard.controller
// stores it in the session) keeps the project menu up on those pages too.
// Controllers that DO know their own project still pass activeProject in
// res.render(), and those locals win over the ones set here -- as does an
// explicit `activeProject: null` from a page that genuinely has no project,
// such as the project list or a dashboard for a user with no projects yet.
async function sidebarProject(req, res, next) {
  const id = req.session && req.session.lastProjectId;

  // Rendered pages only: no logged-in user, no session project, or a non-page
  // request means there is no sidebar to keep stable.
  if (!id || !req.user || req.method !== 'GET' || req.path.includes('/api/')) return next();

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (canAccessProject(project, req.user)) {
      res.locals.activeProject = project;
      res.locals.activeProjectId = project.id;
    }
  } catch (err) {
    // The sidebar is decoration; never fail a page over it.
    console.error('sidebar project lookup failed', err);
  }

  next();
}

module.exports = sidebarProject;
