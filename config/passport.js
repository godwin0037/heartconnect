const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const InstagramStrategy = require('passport-instagram').Strategy;

// These strategies are used purely to *verify* an already-logged-in user's
// social account ownership (not to log in). The user's own HeartConnect id
// is passed through the OAuth `state` param so the callback route knows
// which account to attach the verification to.

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: '/api/auth/facebook/callback',
        profileFields: ['id', 'displayName'],
        passReqToCallback: true,
      },
      (req, accessToken, refreshToken, profile, done) => {
        // Just pass the profile through - the callback route does the DB write.
        return done(null, { platform: 'facebook', id: profile.id, name: profile.displayName });
      }
    )
  );
} else {
  console.warn('⚠️  Facebook OAuth not configured (FACEBOOK_APP_ID/SECRET missing) - verification disabled.');
}

if (process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) {
  passport.use(
    new InstagramStrategy(
      {
        clientID: process.env.INSTAGRAM_APP_ID,
        clientSecret: process.env.INSTAGRAM_APP_SECRET,
        callbackURL: '/api/auth/instagram/callback',
        passReqToCallback: true,
      },
      (req, accessToken, refreshToken, profile, done) => {
        return done(null, { platform: 'instagram', id: profile.id, name: profile.username });
      }
    )
  );
} else {
  console.warn('⚠️  Instagram OAuth not configured (INSTAGRAM_APP_ID/SECRET missing) - verification disabled.');
}

// We don't use passport sessions (JWT-based auth instead), but passport
// requires these to exist when session support is initialized.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

module.exports = passport;
