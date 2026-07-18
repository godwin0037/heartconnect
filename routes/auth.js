const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { getLocationFromIP } = require('../utils/geo');
const { evaluateRisk } = require('../utils/risk');
const upload = require('../middleware/upload');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' },
});

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

/* ---------------------------------------------------------
   POST /api/auth/signup
--------------------------------------------------------- */
router.post('/signup', authLimiter, upload.single('profilePicture'), async (req, res) => {
  try {
    const {
      username,
      password,
      fullName,
      age,
      gender,
      language,
      country,
      whatsapp,
      facebook,
      instagram,
      pinterest,
    } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!fullName || !age || !gender) {
      return res.status(400).json({ error: 'Full name, age, and gender are required' });
    }
    const ageNum = parseInt(age, 10);
    if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 99) {
      return res.status(400).json({ error: 'Age must be between 18 and 99' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A profile picture is required' });
    }
    if (!whatsapp && !facebook && !instagram && !pinterest) {
      return res.status(400).json({ error: 'At least one social link is required' });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(409).json({ error: 'Username is already taken' });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({
      username: username.trim(),
      passwordHash,
      approved: false,
      profileData: {
        fullName,
        age: ageNum,
        gender,
        language,
        country,
        profilePicture: req.file.path, // Cloudinary secure_url
        socialLinks: { whatsapp, facebook, instagram, pinterest },
      },
    });

    const ip = getClientIp(req);
    const ipLocation = await getLocationFromIP(ip);
    if (ipLocation) user.locationHistory.push(ipLocation);

    await evaluateRisk(user);
    await user.save();

    // NOTE: account is pending approval - no token issued yet.
    return res.status(201).json({
      message: 'Account created. An admin will review your profile shortly.',
      pendingApproval: true,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your account' });
  }
});

/* ---------------------------------------------------------
   POST /api/auth/login
--------------------------------------------------------- */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    if (!user.approved && user.role !== 'admin') {
      return res.status(403).json({ error: 'Your account is still pending admin approval' });
    }

    const ip = getClientIp(req);
    const ipLocation = await getLocationFromIP(ip);
    if (ipLocation) {
      user.locationHistory.push(ipLocation);
      await evaluateRisk(user);
      await user.save();
    }

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        approved: user.approved,
        profileData: user.profileData,
        socialVerifications: user.socialVerifications,
        riskScore: user.riskScore,
        riskFlags: user.riskFlags,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong logging in' });
  }
});

/* ---------------------------------------------------------
   GET /api/auth/me  - current session's user info
--------------------------------------------------------- */
router.get('/me', requireAuth, (req, res) => {
  const user = req.user;
  res.json({
    id: user._id,
    username: user.username,
    role: user.role,
    approved: user.approved,
    profileData: user.profileData,
    socialVerifications: user.socialVerifications,
    riskScore: user.riskScore,
    riskFlags: user.riskFlags,
  });
});

/* ---------------------------------------------------------
   Social verification OAuth flow (Facebook / Instagram)
   These only run if the corresponding strategy was configured
   in config/passport.js (i.e. APP_ID/SECRET are set in .env).
--------------------------------------------------------- */
function requireStrategy(name) {
  return (req, res, next) => {
    if (!passport._strategy(name)) {
      return res.status(501).json({ error: `${name} verification is not configured on this server` });
    }
    next();
  };
}

router.get('/facebook', requireAuth, requireStrategy('facebook'), (req, res, next) => {
  const state = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  passport.authenticate('facebook', { state, session: false })(req, res, next);
});

router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/?verify=failed' }), async (req, res) => {
  try {
    const { userId } = jwt.verify(req.query.state, process.env.JWT_SECRET);
    const user = await User.findById(userId);
    if (!user) return res.redirect('/?verify=failed');

    user.socialVerifications.facebook = {
      verified: true,
      socialId: req.user.id,
      verifiedAt: new Date(),
    };
    await evaluateRisk(user);
    await user.save();
    res.redirect('/social-callback?platform=facebook&id=' + req.user.id + '&name=' + encodeURIComponent(req.user.name || ''));
  } catch (err) {
    console.error('Facebook callback error:', err);
    res.redirect('/?verify=failed');
  }
});

router.get('/instagram', requireAuth, requireStrategy('instagram'), (req, res, next) => {
  const state = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  passport.authenticate('instagram', { state, session: false })(req, res, next);
});

router.get('/instagram/callback', passport.authenticate('instagram', { session: false, failureRedirect: '/?verify=failed' }), async (req, res) => {
  try {
    const { userId } = jwt.verify(req.query.state, process.env.JWT_SECRET);
    const user = await User.findById(userId);
    if (!user) return res.redirect('/?verify=failed');

    user.socialVerifications.instagram = {
      verified: true,
      socialId: req.user.id,
      verifiedAt: new Date(),
    };
    await evaluateRisk(user);
    await user.save();
    res.redirect('/social-callback?platform=instagram&id=' + req.user.id + '&name=' + encodeURIComponent(req.user.name || ''));
  } catch (err) {
    console.error('Instagram callback error:', err);
    res.redirect('/?verify=failed');
  }
});

module.exports = router;
