const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.password) {
        return done(null, false, { message: 'flash.invalidCredentials' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'flash.invalidCredentials' });
      }
      if (user.status === 'pending') {
        return done(null, false, { message: 'flash.accountPendingLocal' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
        if (!user) {
          // Check if a user with this email already exists (registered via email/password)
          const email = profile.emails[0].value;
          const existingUser = await prisma.user.findUnique({ where: { email } });
          if (existingUser) {
            // Link Google account to existing user
            user = await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                googleId: profile.id,
                avatar: existingUser.avatar || profile.photos?.[0]?.value,
              },
            });
          } else {
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                name: profile.displayName,
                avatar: profile.photos?.[0]?.value,
                status: 'pending',
              },
            });
            return done(null, false, { message: 'flash.accountCreatedPending' });
          }
        }
        if (user.status === 'pending') {
          return done(null, false, { message: 'flash.accountPendingGoogle' });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});
