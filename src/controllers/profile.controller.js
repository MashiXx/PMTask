const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getProfile = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.render('profile', {
      title: 'Profile',
      projects,
      activeProjectId: null,
      projectTags: [],
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load profile');
    res.redirect('/dashboard');
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      req.flash('error', 'Name and email are required');
      return res.redirect('/profile');
    }

    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: req.user.id } },
    });
    if (existing) {
      req.flash('error', 'Email already in use by another account');
      return res.redirect('/profile');
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email },
    });

    req.flash('success', 'Profile updated');
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update profile');
    res.redirect('/profile');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      req.flash('error', 'New password must be at least 6 characters');
      return res.redirect('/profile');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'New passwords do not match');
      return res.redirect('/profile');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (user.password) {
      if (!currentPassword) {
        req.flash('error', 'Current password is required');
        return res.redirect('/profile');
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        req.flash('error', 'Current password is incorrect');
        return res.redirect('/profile');
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    req.flash('success', 'Password changed successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to change password');
    res.redirect('/profile');
  }
};

const VALID_THEMES = ['light', 'dark', 'system'];

exports.updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: 'Invalid theme' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { theme },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update theme' });
  }
};
