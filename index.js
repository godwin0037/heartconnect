const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const InstagramStrategy = require('passport-instagram').Strategy;
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ── Debug ──
console.log('🔍 MONGODB_URI is set:', process.env.MONGODB_URI ? '✅ yes' : '❌ no');

// ── Cloudinary Config ──
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your-cloud-name',
    api_key: process.env.CLOUDINARY_API_KEY || 'your-api-key',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'your-api-secret'
});

// ── MongoDB Connection ──
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heartconnect';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ──────────────────────────────────────────────
// ✅ SCHEMAS – DEFINED FIRST
// ──────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    approved: { type: Boolean, default: false },
    profileData: {
        name: String,
        age: Number,
        gender: String,
        language: String,
        country: String,
        whatsapp: String,
        facebook: String,
        instagram: String,
        pinterest: String,
        picture: String
    },
    socialVerifications: {
        type: Map,
        of: {
            socialId: String,
            socialName: String,
            verifiedAt: Date,
            createdAt: Date
        },
        default: {}
    },
    locationHistory: [{
        timestamp: { type: Date, default: Date.now },
        ip: { type: String },
        country: { type: String },
        city: { type: String },
        lat: { type: Number },
        lon: { type: Number },
        type: { type: String },
        accuracy: { type: Number }
    }],
    riskScore: { type: Number, default: 0 },
    riskFlags: [String],
    createdAt: { type: Date, default: Date.now }
});

const ProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    language: String,
    country: String,
    whatsapp: String,
    facebook: String,
    instagram: String,
    pinterest: String,
    picture: String,
    exported: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const LikeSchema = new mongoose.Schema({
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now }
});

const ReportSchema = new mongoose.Schema({
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reporterUsername: String,
    reason: String,
    description: String,
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const ChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: String,
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    messages: [{
        sender: { type: String, enum: ['user', 'admin'] },
        senderName: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
        read: { type: Boolean, default: false }
    }],
    createdAt: { type: Date, default: Date.now }
});

const NoticeSchema = new mongoose.Schema({
    message: String,
    active: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

const DeletedUserSchema = new mongoose.Schema({
    userId: Number,
    username: String,
    deletedAt: { type: Date, default: Date.now },
    reason: String
});

const AdminLogSchema = new mongoose.Schema({
    adminId: Number,
    adminUsername: String,
    action: String,
    targetUserId: Number,
    reason: String,
    timestamp: { type: Date, default: Date.now }
});

// ──────────────────────────────────────────────
// ✅ MODELS – CREATED AFTER SCHEMAS
// ──────────────────────────────────────────────

const User = mongoose.model('User', UserSchema);
const Profile = mongoose.model('Profile', ProfileSchema);
const Like = mongoose.model('Like', LikeSchema);
const Report = mongoose.model('Report', ReportSchema);
const Chat = mongoose.model('Chat', ChatSchema);
const Notice = mongoose.model('Notice', NoticeSchema);
const DeletedUser = mongoose.model('DeletedUser', DeletedUserSchema);
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

// ── Seed Admin ──
async function seedAdmin() {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
        const hashed = await bcrypt.hash('admin123', 10);
        const admin = new User({
            username: 'admin',
            password: hashed,
            role: 'admin',
            approved: true,
            profileData: { name: 'Admin', age: 30, gender: 'Other', language: 'English', country: 'United States' }
        });
        await admin.save();
        console.log('✅ Admin created: username=admin, password=admin123');
    }
}
seedAdmin();

// ── Cloudinary Multer Storage ──
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'heartconnect/profiles',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ──
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ── Passport (OAuth – optional) ──
app.use(passport.initialize());
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || 'dummy',
    clientSecret: process.env.FACEBOOK_APP_SECRET || 'dummy',
    callbackURL: "http://localhost:3000/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'email', 'name', 'picture.type(large)']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.use(new InstagramStrategy({
    clientID: process.env.INSTAGRAM_APP_ID || 'dummy',
    clientSecret: process.env.INSTAGRAM_APP_SECRET || 'dummy',
    callbackURL: "http://localhost:3000/auth/instagram/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// ── Authentication Middleware ──
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
}

// ── Admin Logging ──
async function logAdminAction(adminId, adminUsername, action, targetUserId, reason) {
    const log = new AdminLog({ adminId, adminUsername, action, targetUserId: targetUserId || null, reason: reason || 'No reason provided' });
    await log.save();
}

// ── IP Geolocation ──
async function getLocationFromIP(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
        if (response.data.status === 'success') {
            return {
                country: response.data.countryCode,
                city: response.data.city,
                lat: response.data.lat,
                lon: response.data.lon,
                isp: response.data.isp
            };
        }
        return null;
    } catch (error) {
        console.error('IP Geolocation error:', error.message);
        return null;
    }
}

// ── NEW: Reverse Geocode (Lat/Lon → City/Country) ──
async function getLocationFromCoords(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'HeartConnect/1.0' },
            timeout: 5000
        });
        if (response.data && response.data.address) {
            const address = response.data.address;
            const city = address.city || address.town || address.village || address.county || 'Unknown';
            const country = address.country || 'Unknown';
            return { city, country };
        }
        return null;
    } catch (error) {
        console.error('Reverse geocoding error:', error.message);
        return null;
    }
}

// ── Risk Engine (Robust Version) ──
async function evaluateRisk(user) {
    let flags = [], riskScore = 0;

    try {
        if (user.locationHistory && user.locationHistory.length > 1) {
            const lastTwo = user.locationHistory.slice(-2);
            const last = lastTwo[lastTwo.length - 1];
            const prev = lastTwo[lastTwo.length - 2];
            if (last.country && prev.country && last.country !== prev.country) {
                flags.push('Country mismatch: login location changed.');
                riskScore += 2;
            }
        }

        if (user.socialVerifications && user.socialVerifications.size > 0) {
            for (const [platform, socialData] of user.socialVerifications) {
                if (socialData && socialData.createdAt) {
                    const daysOld = (Date.now() - new Date(socialData.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysOld < 7) {
                        flags.push(`Social account (${platform}) is less than 7 days old.`);
                        riskScore += 1;
                    }
                }
            }
        }

        if (user.locationHistory && user.locationHistory.length > 0) {
            const lastIp = user.locationHistory[user.locationHistory.length - 1]?.ip;
            if (lastIp) {
                const sameIPCount = await User.countDocuments({ 'locationHistory.ip': lastIp });
                if (sameIPCount > 3) {
                    flags.push(`More than 3 accounts from same IP (${sameIPCount}).`);
                    riskScore += 3;
                }
            }
        }

        if (!user.socialVerifications || user.socialVerifications.size === 0) {
            flags.push('No social account verified via OAuth.');
            riskScore += 1;
        }

        user.riskScore = riskScore;
        user.riskFlags = flags;
        await user.save();
    } catch (err) {
        console.error('❌ Error in evaluateRisk:', err);
    }
    return { riskScore, flags };
}

// ──────────────────────────────────────────────
// ✅ ALL API ROUTES – MUST BE BEFORE STATIC FILES
// ──────────────────────────────────────────────

// ─── AUTH ROUTES ───

app.post('/api/auth/signup', upload.single('picture'), async (req, res) => {
    try {
        const { username, password, name, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;
        if (!username || username.length < 3) return res.status(400).json({ error: 'Username min 3 chars' });
        if (!password || password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required' });
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) return res.status(400).json({ error: 'Age 18-99' });
        if (!gender) return res.status(400).json({ error: 'Gender required' });
        if (!req.file) return res.status(400).json({ error: 'Profile picture required' });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username taken' });

        const hashed = await bcrypt.hash(password, 10);
        const pictureUrl = req.file.path;

        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
        const location = await getLocationFromIP(clientIP);

        const newUser = new User({
            username,
            password: hashed,
            role: 'user',
            approved: false,
            profileData: {
                name: name.trim(), age: ageNum, gender,
                language: language || '', country: country || '',
                whatsapp: whatsapp || '', facebook: facebook || '', instagram: instagram || '', pinterest: pinterest || '',
                picture: pictureUrl
            },
            locationHistory: location ? [{ timestamp: new Date(), ip: clientIP, ...location, type: 'signup' }] : [],
            socialVerifications: new Map()
        });
        await newUser.save();

        const newProfile = new Profile({
            userId: newUser._id,
            name: name.trim(), age: ageNum, gender,
            language: language || '', country: country || '',
            whatsapp: whatsapp || '', facebook: facebook || '', instagram: instagram || '', pinterest: pinterest || '',
            picture: pictureUrl
        });
        await newProfile.save();

        await evaluateRisk(newUser);
        res.status(201).json({ message: 'User registered. Awaiting admin approval.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.approved) return res.status(403).json({ error: 'Account pending approval' });

        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
        const location = await getLocationFromIP(clientIP);
        if (location) {
            user.locationHistory.push({ timestamp: new Date(), ip: clientIP, ...location, type: 'login' });
            if (user.locationHistory.length > 10) user.locationHistory = user.locationHistory.slice(-10);
            await evaluateRisk(user);
            await user.save();
        }

        const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                approved: user.approved,
                profileData: user.profileData || null,
                socialVerifications: user.socialVerifications || {},
                riskScore: user.riskScore || 0,
                riskFlags: user.riskFlags || []
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            id: user._id,
            username: user.username,
            role: user.role,
            approved: user.approved,
            profileData: user.profileData || null,
            socialVerifications: user.socialVerifications || {},
            riskScore: user.riskScore || 0,
            riskFlags: user.riskFlags || []
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PROFILE ROUTES ───

app.get('/api/profiles/me', authenticate, async (req, res) => {
    try {
        const profile = await Profile.findOne({ userId: req.user.id });
        res.json(profile || null);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        let query = {};
        const search = req.query.search ? req.query.search.toLowerCase().trim() : '';
        if (search) query.name = { $regex: search, $options: 'i' };
        const genderFilter = req.query.gender ? req.query.gender.trim() : '';
        if (genderFilter && genderFilter !== 'All') query.gender = genderFilter;
        const ageMin = req.query.ageMin ? parseInt(req.query.ageMin, 10) : 18;
        const ageMax = req.query.ageMax ? parseInt(req.query.ageMax, 10) : 99;
        query.age = { $gte: ageMin, $lte: ageMax };

        let sort = { createdAt: -1 };
        switch (req.query.sort || 'newest') {
            case 'newest': sort = { createdAt: -1 }; break;
            case 'oldest': sort = { createdAt: 1 }; break;
            case 'age_asc': sort = { age: 1 }; break;
            case 'age_desc': sort = { age: -1 }; break;
            case 'likes': sort = { likeCount: -1 }; break;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const skip = (page - 1) * limit;

        const profiles = await Profile.aggregate([
            { $match: query },
            { $lookup: { from: 'likes', localField: '_id', foreignField: 'profileId', as: 'likes' } },
            { $addFields: { likeCount: { $size: '$likes' } } },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit }
        ]);

        const total = await Profile.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        const userIds = profiles.map(p => p.userId);
        const users = await User.find({ _id: { $in: userIds } }).select('socialVerifications _id');
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = u.socialVerifications || new Map(); });

        const enriched = profiles.map(p => {
            const isVerified = userMap[p.userId.toString()] && Object.keys(userMap[p.userId.toString()]).length > 0;
            return {
                ...p,
                id: p._id,
                isVerified,
                socialVerifications: userMap[p.userId.toString()] || {}
            };
        });

        res.json({
            profiles: enriched,
            pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) return res.status(404).json({ error: 'Not found' });
        const likeCount = await Like.countDocuments({ profileId: profile._id });
        res.json({ ...profile.toObject(), id: profile._id, likeCount });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/profiles/:id/like', authenticate, async (req, res) => {
    try {
        const profileId = req.params.id;
        const userId = req.user.id;
        const existing = await Like.findOne({ profileId, userId });
        if (existing) {
            await Like.deleteOne({ _id: existing._id });
            const count = await Like.countDocuments({ profileId });
            return res.json({ liked: false, likeCount: count });
        } else {
            const like = new Like({ profileId, userId, timestamp: new Date() });
            await like.save();
            const count = await Like.countDocuments({ profileId });
            return res.json({ liked: true, likeCount: count });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/profiles', authenticate, upload.single('picture'), async (req, res) => {
    try {
        const { name, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required' });
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) return res.status(400).json({ error: 'Age 18-99' });
        if (!gender) return res.status(400).json({ error: 'Gender required' });
        const hasSocial = [whatsapp, facebook, instagram, pinterest].some(s => s && s.trim() !== '');
        if (!hasSocial) return res.status(400).json({ error: 'At least one social link required' });

        const existing = await Profile.findOne({ userId: req.user.id });
        if (existing) return res.status(400).json({ error: 'You already have a profile' });

        const pictureUrl = req.file ? req.file.path : '';
        const newProfile = new Profile({
            userId: req.user.id,
            name: name.trim(), age: ageNum, gender,
            language: language || '', country: country || '',
            whatsapp: whatsapp || '', facebook: facebook || '', instagram: instagram || '', pinterest: pinterest || '',
            picture: pictureUrl
        });
        await newProfile.save();

        await User.findByIdAndUpdate(req.user.id, {
            'profileData': { name: name.trim(), age: ageNum, gender, language: language || '', country: country || '', whatsapp: whatsapp || '', facebook: facebook || '', instagram: instagram || '', pinterest: pinterest || '', picture: pictureUrl }
        });

        res.status(201).json(newProfile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profiles/:id', authenticate, upload.single('picture'), async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        if (profile.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Permission denied' });
        }
        const { name, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required' });
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) return res.status(400).json({ error: 'Age 18-99' });
        if (!gender) return res.status(400).json({ error: 'Gender required' });

        profile.name = name.trim(); profile.age = ageNum; profile.gender = gender;
        profile.language = language || ''; profile.country = country || '';
        profile.whatsapp = whatsapp || ''; profile.facebook = facebook || ''; profile.instagram = instagram || ''; profile.pinterest = pinterest || '';
        if (req.file) profile.picture = req.file.path;
        await profile.save();

        await User.findByIdAndUpdate(req.user.id, {
            'profileData': { name: profile.name, age: profile.age, gender: profile.gender, language: profile.language, country: profile.country, whatsapp: profile.whatsapp, facebook: profile.facebook, instagram: profile.instagram, pinterest: profile.pinterest, picture: profile.picture }
        });

        res.json(profile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/profiles/:id', authenticate, async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) return res.status(404).json({ error: 'Not found' });
        if (profile.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Permission denied' });
        }
        await Profile.deleteOne({ _id: profile._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── VERIFY SOCIAL ───
app.post('/api/verify/social', authenticate, async (req, res) => {
    try {
        const { platform, socialId, socialName } = req.body;
        if (!platform || !socialId) return res.status(400).json({ error: 'Platform and social ID required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.socialVerifications) user.socialVerifications = new Map();
        user.socialVerifications.set(platform, {
            socialId,
            socialName: socialName || '',
            verifiedAt: new Date(),
            createdAt: new Date()
        });
        await user.save();
        await evaluateRisk(user);
        res.json({ success: true, socialVerifications: Object.fromEntries(user.socialVerifications) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── LOCATION (with Reverse Geocoding) ───
app.post('/api/location/precise', authenticate, async (req, res) => {
    try {
        const { lat, lon, accuracy } = req.body;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude and longitude required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Ensure locationHistory exists
        if (!user.locationHistory) user.locationHistory = [];

        // Try to get city/country from coordinates
        let locationInfo = await getLocationFromCoords(lat, lon);
        if (!locationInfo) {
            // Fallback: use IP-based location if available
            const lastIpEntry = user.locationHistory.filter(e => e.ip).pop();
            locationInfo = {
                city: lastIpEntry?.city || 'Unknown',
                country: lastIpEntry?.country || 'Unknown'
            };
        }

        user.locationHistory.push({
            timestamp: new Date(),
            type: 'precise',
            lat,
            lon,
            accuracy,
            city: locationInfo.city,
            country: locationInfo.country
        });

        // Keep only the last 10 entries
        if (user.locationHistory.length > 10) {
            user.locationHistory = user.locationHistory.slice(-10);
        }

        await user.save();
        await evaluateRisk(user);

        res.json({ success: true });
    } catch (err) {
        console.error('❌ Location error:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ─── NOTICE ───
app.get('/api/notice', async (req, res) => {
    try {
        const notice = await Notice.findOne().sort({ updatedAt: -1 });
        res.json(notice || { message: '', active: false, updatedAt: null });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/notice', authenticate, requireAdmin, async (req, res) => {
    try {
        const { message, active } = req.body;
        if (typeof message !== 'string') return res.status(400).json({ error: 'Message required' });

        const notice = await Notice.findOne();
        if (notice) {
            notice.message = message.trim();
            notice.active = active !== undefined ? Boolean(active) : true;
            notice.updatedAt = new Date();
            await notice.save();
        } else {
            const newNotice = new Notice({ message: message.trim(), active: active !== undefined ? Boolean(active) : true, updatedAt: new Date() });
            await newNotice.save();
        }
        await logAdminAction(req.user.id, req.user.username, 'Updated notice', null, `Message: ${message.substring(0, 50)}...`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── USER ACCOUNT DELETION ───
app.delete('/api/users/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const deletedUser = new DeletedUser({ userId: user._id, username: user.username, reason: req.body.reason || 'User requested' });
        await deletedUser.save();

        await Profile.deleteMany({ userId: user._id });
        await Like.deleteMany({ userId: user._id });
        await Chat.deleteMany({ userId: user._id });
        await Report.deleteMany({ reporterUserId: user._id });
        await User.deleteOne({ _id: user._id });

        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── ADMIN USERS ───
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        const userIds = users.map(u => u._id);
        const profiles = await Profile.find({ userId: { $in: userIds } });
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.userId.toString()] = p; });

        const enriched = users.map(u => ({
            ...u.toObject(),
            id: u._id,
            hasProfile: !!profileMap[u._id.toString()],
            profile: profileMap[u._id.toString()] || null
        }));
        console.log('📌 Admin users API returning:', enriched.length, 'users');
        res.json(enriched);
    } catch (err) {
        console.error('❌ Error loading admin users:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.approved) return res.status(400).json({ error: 'Already approved' });
        user.approved = true;
        await user.save();
        await logAdminAction(req.user.id, req.user.username, 'Approved user', user._id, 'User approved');
        res.json({ message: 'User approved' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await Profile.deleteMany({ userId: user._id });
        await Like.deleteMany({ userId: user._id });
        await Chat.deleteMany({ userId: user._id });
        await Report.deleteMany({ reporterUserId: user._id });
        await User.deleteOne({ _id: user._id });
        await logAdminAction(req.user.id, req.user.username, 'Deleted user', user._id, 'User deleted by admin');
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/users/:id/promote', authenticate, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin') return res.status(400).json({ error: 'Already admin' });
        user.role = 'admin';
        user.approved = true;
        await user.save();
        await logAdminAction(req.user.id, req.user.username, 'Promoted user', user._id, 'User promoted to admin');
        res.json({ message: 'User promoted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── ADMIN REPORTS ───
app.get('/api/admin/reports', authenticate, requireAdmin, async (req, res) => {
    try {
        const reports = await Report.find().sort({ createdAt: -1 });
        const profileIds = reports.map(r => r.profileId);
        const profiles = await Profile.find({ _id: { $in: profileIds } });
        const profileMap = {};
        profiles.forEach(p => { profileMap[p._id.toString()] = p.name; });
        const enriched = reports.map(r => ({ ...r.toObject(), profileName: profileMap[r.profileId.toString()] || 'Deleted Profile' }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/reports/:id/resolve', authenticate, requireAdmin, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        report.status = 'resolved';
        await report.save();
        await logAdminAction(req.user.id, req.user.username, 'Resolved report', null, `Report ID: ${req.params.id}`);
        res.json({ message: 'Report resolved' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── CHAT ───
app.get('/api/chat/me', authenticate, async (req, res) => {
    try {
        let chat = await Chat.findOne({ userId: req.user.id });
        if (!chat) {
            chat = new Chat({ userId: req.user.id, username: req.user.username, status: 'open', messages: [] });
            await chat.save();
        }
        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/chat/send', authenticate, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required' });

        let chat = await Chat.findOne({ userId: req.user.id });
        if (!chat) {
            chat = new Chat({ userId: req.user.id, username: req.user.username, status: 'open', messages: [] });
        }
        chat.messages.push({ sender: 'user', senderName: req.user.username, message: message.trim(), timestamp: new Date() });
        chat.status = 'open';
        await chat.save();
        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/chats/:id/reply', authenticate, requireAdmin, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        const { message } = req.body;
        if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required' });
        chat.messages.push({ sender: 'admin', senderName: 'Admin', message: message.trim(), timestamp: new Date() });
        chat.status = 'open';
        await chat.save();
        await logAdminAction(req.user.id, req.user.username, 'Replied to chat', chat.userId, `Chat ID: ${req.params.id}`);
        res.json(chat);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/chats/:id/resolve', authenticate, requireAdmin, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        chat.status = 'resolved';
        await chat.save();
        await logAdminAction(req.user.id, req.user.username, 'Resolved chat', chat.userId, `Chat ID: ${req.params.id}`);
        res.json({ message: 'Chat resolved' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/chats', authenticate, requireAdmin, async (req, res) => {
    try {
        const chats = await Chat.find().sort({ createdAt: -1 });
        res.json(chats);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── ADMIN DELETIONS ───
app.get('/api/admin/deleted-users', authenticate, requireAdmin, async (req, res) => {
    try {
        const deleted = await DeletedUser.find().sort({ deletedAt: -1 });
        res.json(deleted);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── ADMIN EXPORT ───
app.post('/api/admin/export', authenticate, requireAdmin, async (req, res) => {
    try {
        const profiles = await Profile.find({ exported: false });
        if (profiles.length === 0) return res.json({ message: 'No new profiles', profiles: [] });
        await Profile.updateMany({ exported: false }, { exported: true });
        res.json({ profiles, count: profiles.length });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── OAuth ROUTES ───
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login' }),
    (req, res) => res.redirect(`/social-callback?platform=facebook&id=${req.user.id}&name=${req.user.displayName}`)
);
app.get('/auth/instagram', passport.authenticate('instagram'));
app.get('/auth/instagram/callback', passport.authenticate('instagram', { failureRedirect: '/login' }),
    (req, res) => res.redirect(`/social-callback?platform=instagram&id=${req.user.id}&name=${req.user.username}`)
);

// ─── 404 Handler for API ─────────────────────────────
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// ──────────────────────────────────────────────────────────────
// ⚠️ STATIC FILES – MUST COME AFTER ALL API ROUTES
// ──────────────────────────────────────────────────────────────
app.use(express.static('public'));

// ─── LEGAL PAGES ──────────────────────────────────────────────
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/admin-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-policy.html')));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// ─── CATCH-ALL (SPA) – MUST BE LAST ──────────────────────────
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START SERVER ──────────────────────────────────────────────
app.listen(PORT,'0.0.0.0', () => {
    console.log(`💕 HeartConnect running at http://localhost:${PORT}`);
    console.log(`📦 MongoDB: ${MONGODB_URI.replace(/:[^:@]*@/, ':****@')}`);
    console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'not configured'}`);
});