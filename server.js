require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const passport = require('./config/passport');
const seedAdmin = require('./utils/seedAdmin');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profiles');
const likeRoutes = require('./routes/likes');
const reportRoutes = require('./routes/reports');
const chatRoutes = require('./routes/chat');
const noticeRoutes = require('./routes/notices');
const locationRoutes = require('./routes/location');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport needs a session only for the brief OAuth handshake (state is
// carried via a signed JWT, not the session, but passport itself expects
// session support to be initialized when using session: false is not set
// on some internal calls).
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-too',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());

// Basic global rate limit to slow down abuse
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
  })
);

// ---------- API routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/likes', likeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Static frontend + legal pages ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/admin-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-policy.html')));
app.get('/social-callback', (req, res) => res.sendFile(path.join(__dirname, 'public', 'social-callback.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our end' });
});

async function start() {
  await connectDB();
  await seedAdmin();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💕 HeartConnect running at http://localhost:${PORT}`);
  });
}

start();
