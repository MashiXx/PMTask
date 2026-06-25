const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const { uploadDir } = require('../config/upload');
const { isPathSafe } = require('../utils/file-serve');
const { SUPPORTED } = require('../config/i18n');

// A local (uploaded) avatar is a relative path; a Google avatar is an http(s) URL.
function isLocalAvatar(avatar) {
  return !!avatar && !/^https?:\/\//i.test(avatar);
}

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
      activePage: 'profile',
    });
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('flash.loadProfileFailed'));
    res.redirect('/dashboard');
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      req.flash('error', req.t('flash.nameEmailRequired'));
      return res.redirect('/profile');
    }

    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: req.user.id } },
    });
    if (existing) {
      req.flash('error', req.t('flash.emailInUse'));
      return res.redirect('/profile');
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email },
    });

    req.flash('success', req.t('flash.profileUpdated'));
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('flash.updateProfileFailed'));
    res.redirect('/profile');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      req.flash('error', req.t('flash.newPasswordTooShort'));
      return res.redirect('/profile');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', req.t('flash.newPasswordsMismatch'));
      return res.redirect('/profile');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (user.password) {
      if (!currentPassword) {
        req.flash('error', req.t('flash.currentPasswordRequired'));
        return res.redirect('/profile');
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        req.flash('error', req.t('flash.currentPasswordIncorrect'));
        return res.redirect('/profile');
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    req.flash('success', req.t('flash.passwordChanged'));
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('flash.changePasswordFailed'));
    res.redirect('/profile');
  }
};

// POST /profile/avatar — upload a new profile picture
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', req.t('flash.noImageUploaded'));
      return res.redirect('/profile');
    }
    if (!isPathSafe(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      req.flash('error', req.t('flash.invalidFile'));
      return res.redirect('/profile');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    // Remove the previous uploaded avatar file (skip Google URLs)
    if (user && isLocalAvatar(user.avatar)) {
      try { fs.unlinkSync(path.resolve(uploadDir, user.avatar)); } catch (e) {}
    }

    const rel = path.relative(uploadDir, req.file.path);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatar: rel } });

    req.flash('success', req.t('flash.avatarUpdated'));
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    req.flash('error', req.t('flash.uploadAvatarFailed'));
    res.redirect('/profile');
  }
};

// POST /profile/avatar/delete — revert to initials
exports.deleteAvatar = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user && isLocalAvatar(user.avatar)) {
      try { fs.unlinkSync(path.resolve(uploadDir, user.avatar)); } catch (e) {}
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { avatar: null } });
    req.flash('success', req.t('flash.avatarRemoved'));
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('flash.removeAvatarFailed'));
    res.redirect('/profile');
  }
};

const AVATAR_CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

// GET /users/:id/avatar — serve a user's uploaded avatar (open: avatars are non-sensitive)
exports.serveAvatar = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).end();

    const user = await prisma.user.findUnique({ where: { id }, select: { avatar: true } });
    if (!user || !user.avatar) return res.status(404).end();

    // External (Google) avatar → redirect to the source URL
    if (/^https?:\/\//i.test(user.avatar)) return res.redirect(user.avatar);

    const abs = path.resolve(uploadDir, user.avatar);
    if (!isPathSafe(abs) || !fs.existsSync(abs)) return res.status(404).end();

    const ext = path.extname(abs).toLowerCase();
    res.setHeader('Content-Type', AVATAR_CONTENT_TYPES[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(abs);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
};

const VALID_THEMES = ['light', 'dark'];

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

exports.updateLanguage = async (req, res) => {
  try {
    const { language } = req.body;
    if (!SUPPORTED.includes(language)) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { language },
    });
    res.cookie('pmtask-lang', language, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update language' });
  }
};
