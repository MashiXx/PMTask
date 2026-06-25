module.exports = {
  isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash('error', req.t('flash.pleaseLogin'));
    res.redirect('/auth/login');
  },
  isGuest(req, res, next) {
    if (!req.isAuthenticated()) return next();
    res.redirect('/dashboard');
  },
  isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.flash('error', req.t('flash.accessDenied'));
    res.redirect('/dashboard');
  },
};
