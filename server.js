const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ── Folders ──
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LIKES_FILE = path.join(DATA_DIR, 'likes.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// ── JSON helpers ──
function readJSON(file) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify([]));
        return [];
    }
    try {
        const data = fs.readFileSync(file, 'utf8');
        if (!data || data.trim() === '') {
            fs.writeFileSync(file, JSON.stringify([]));
            return [];
        }
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
            fs.writeFileSync(file, JSON.stringify([]));
            return [];
        }
        return parsed;
    } catch (_) {
        fs.writeFileSync(file, JSON.stringify([]));
        return [];
    }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ── Users ──
function getUsers() { return readJSON(USERS_FILE); }
function saveUsers(users) { writeJSON(USERS_FILE, users); }

// ── Seed admin ──
function seedAdmin() {
    const users = getUsers();
    if (!users.find(u => u.role === 'admin')) {
        const hashed = bcrypt.hashSync('admin123', 10);
        users.push({
            id: 1,
            username: 'admin',
            password: hashed,
            role: 'admin',
            approved: true,
            profileData: { name: 'Admin', age: 30, gender: 'Other', language: 'English', country: 'United States' },
            createdAt: new Date().toISOString()
        });
        saveUsers(users);
        console.log('✅ Admin: username=admin, password=admin123');
    }
}
seedAdmin();

// ── Profiles, Likes, Reports, Chats ──
function getProfiles() { return readJSON(PROFILES_FILE); }
function saveProfiles(profiles) { writeJSON(PROFILES_FILE, profiles); }
function getLikes() { return readJSON(LIKES_FILE); }
function saveLikes(likes) { writeJSON(LIKES_FILE, likes); }
function getReports() { return readJSON(REPORTS_FILE); }
function saveReports(reports) { writeJSON(REPORTS_FILE, reports); }
function getChats() { return readJSON(CHATS_FILE); }
function saveChats(chats) { writeJSON(CHATS_FILE, chats); }

// ── Multer ──
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'profile-' + unique + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ── Auth middleware ──
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

        const users = getUsers();
        if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username taken' });

        const hashed = await bcrypt.hash(password, 10);
        const pictureUrl = `/uploads/${req.file.filename}`;
        const newUser = {
            id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: hashed,
            role: 'user',
            approved: false,
            profileData: {
                name: name.trim(),
                age: ageNum,
                gender,
                language: language || '',
                country: country || '',
                whatsapp: whatsapp || '',
                facebook: facebook || '',
                instagram: instagram || '',
                pinterest: pinterest || '',
                picture: pictureUrl
            },
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        saveUsers(users);
        res.status(201).json({ message: 'User registered. Awaiting admin approval.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const users = getUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.approved) return res.status(403).json({ error: 'Account pending approval' });
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            approved: user.approved,
            profileData: user.profileData || null
        }
    });
});

app.get('/api/auth/me', authenticate, (req, res) => {
    const users = getUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        approved: user.approved,
        profileData: user.profileData || null
    });
});

// ─── PROFILE ROUTES ───

app.get('/api/profiles', (req, res) => {
    let profiles = getProfiles();
    const likes = getLikes();

    const search = req.query.search ? req.query.search.toLowerCase().trim() : '';
    if (search) profiles = profiles.filter(p => p.name.toLowerCase().includes(search));

    const genderFilter = req.query.gender ? req.query.gender.trim() : '';
    if (genderFilter && genderFilter !== 'All') profiles = profiles.filter(p => p.gender === genderFilter);

    const ageMin = req.query.ageMin ? parseInt(req.query.ageMin, 10) : 18;
    const ageMax = req.query.ageMax ? parseInt(req.query.ageMax, 10) : 99;
    profiles = profiles.filter(p => p.age >= ageMin && p.age <= ageMax);

    const sortBy = req.query.sort || 'newest';
    switch (sortBy) {
        case 'newest': profiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
        case 'oldest': profiles.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
        case 'age_asc': profiles.sort((a, b) => a.age - b.age); break;
        case 'age_desc': profiles.sort((a, b) => b.age - a.age); break;
        case 'likes':
            profiles.sort((a, b) => {
                const likesA = likes.filter(l => l.profileId === a.id).length;
                const likesB = likes.filter(l => l.profileId === b.id).length;
                return likesB - likesA;
            });
            break;
        default: profiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const total = profiles.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = profiles.slice(start, start + limit);

    const enriched = paginated.map(p => ({
        ...p,
        likeCount: likes.filter(l => l.profileId === p.id).length
    }));

    res.json({
        profiles: enriched,
        pagination: {
            page, limit, total, totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    });
});

app.get('/api/profiles/:id', (req, res) => {
    const profiles = getProfiles();
    const id = parseInt(req.params.id);
    const profile = profiles.find(p => p.id === id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    const likes = getLikes();
    res.json({ ...profile, likeCount: likes.filter(l => l.profileId === id).length });
});

// ─── NEW: GET CURRENT USER'S PROFILE ───
// This is the route the Settings button uses
app.get('/api/profiles/me', authenticate, (req, res) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.userId === req.user.id);
    res.json(profile || null);
});

app.post('/api/profiles/:id/like', authenticate, (req, res) => {
    const profileId = parseInt(req.params.id);
    const userId = req.user.id;
    let likes = getLikes();
    const existing = likes.find(l => l.profileId === profileId && l.userId === userId);
    if (existing) {
        likes = likes.filter(l => !(l.profileId === profileId && l.userId === userId));
        saveLikes(likes);
        return res.json({ liked: false, likeCount: likes.filter(l => l.profileId === profileId).length });
    } else {
        likes.push({ id: likes.length ? Math.max(...likes.map(l => l.id)) + 1 : 1, profileId, userId, timestamp: new Date().toISOString() });
        saveLikes(likes);
        return res.json({ liked: true, likeCount: likes.filter(l => l.profileId === profileId).length });
    }
});

app.post('/api/profiles', authenticate, upload.single('picture'), (req, res) => {
    try {
        const { name, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required' });
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) return res.status(400).json({ error: 'Age 18-99' });
        if (!gender) return res.status(400).json({ error: 'Gender required' });
        const hasSocial = [whatsapp, facebook, instagram, pinterest].some(s => s && s.trim() !== '');
        if (!hasSocial) return res.status(400).json({ error: 'At least one social link required' });

        let profiles = getProfiles();
        if (profiles.find(p => p.userId === req.user.id)) {
            return res.status(400).json({ error: 'You already have a profile' });
        }

        const newProfile = {
            id: profiles.length ? Math.max(...profiles.map(p => p.id)) + 1 : 1,
            userId: req.user.id,
            name: name.trim(),
            age: ageNum,
            gender,
            language: language || '',
            country: country || '',
            whatsapp: whatsapp || '',
            facebook: facebook || '',
            instagram: instagram || '',
            pinterest: pinterest || '',
            picture: req.file ? `/uploads/${req.file.filename}` : '',
            createdAt: new Date().toISOString()
        };
        profiles.push(newProfile);
        saveProfiles(profiles);
        res.status(201).json(newProfile);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profiles/:id', authenticate, upload.single('picture'), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;
        let profiles = getProfiles();
        const index = profiles.findIndex(p => p.id === id);
        if (index === -1) return res.status(404).json({ error: 'Profile not found' });
        const profile = profiles[index];
        if (profile.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Permission denied' });
        }
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required' });
        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) return res.status(400).json({ error: 'Age 18-99' });
        if (!gender) return res.status(400).json({ error: 'Gender required' });

        profile.name = name.trim();
        profile.age = ageNum;
        profile.gender = gender;
        profile.language = language || '';
        profile.country = country || '';
        profile.whatsapp = whatsapp || '';
        profile.facebook = facebook || '';
        profile.instagram = instagram || '';
        profile.pinterest = pinterest || '';
        if (req.file) {
            if (profile.picture && profile.picture.startsWith('/uploads/')) {
                const oldPath = path.join(__dirname, profile.picture);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            profile.picture = `/uploads/${req.file.filename}`;
        }
        saveProfiles(profiles);
        // Update user.profileData
        let users = getUsers();
        const user = users.find(u => u.id === req.user.id);
        if (user && user.profileData) {
            user.profileData.name = profile.name;
            user.profileData.age = profile.age;
            user.profileData.gender = profile.gender;
            user.profileData.language = profile.language;
            user.profileData.country = profile.country;
            user.profileData.whatsapp = profile.whatsapp;
            user.profileData.facebook = profile.facebook;
            user.profileData.instagram = profile.instagram;
            user.profileData.pinterest = profile.pinterest;
            user.profileData.picture = profile.picture;
            saveUsers(users);
        }
        res.json(profile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/profiles/:id', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    let profiles = getProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    const profile = profiles[index];
    if (profile.userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Permission denied' });
    }
    if (profile.picture && profile.picture.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, profile.picture);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    profiles.splice(index, 1);
    saveProfiles(profiles);
    res.json({ success: true });
});

// ─── REPORT ROUTES ───

app.post('/api/reports', authenticate, (req, res) => {
    const { profileId, reason, description } = req.body;
    if (!profileId) return res.status(400).json({ error: 'Profile ID required' });
    if (!reason || reason.trim().length < 3) return res.status(400).json({ error: 'Reason required' });
    const profiles = getProfiles();
    if (!profiles.find(p => p.id === parseInt(profileId))) return res.status(404).json({ error: 'Profile not found' });
    let reports = getReports();
    if (reports.find(r => r.profileId === parseInt(profileId) && r.reporterUserId === req.user.id && r.status === 'pending')) {
        return res.status(400).json({ error: 'Already reported' });
    }
    reports.push({
        id: reports.length ? Math.max(...reports.map(r => r.id)) + 1 : 1,
        profileId: parseInt(profileId),
        reporterUserId: req.user.id,
        reporterUsername: req.user.username,
        reason: reason.trim(),
        description: description ? description.trim() : '',
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    saveReports(reports);
    res.status(201).json({ message: 'Report submitted' });
});

// ─── ADMIN ROUTES ───

app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
    const users = getUsers().map(({ password, ...rest }) => rest);
    res.json(users);
});

app.put('/api/admin/users/:id/approve', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let users = getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.approved) return res.status(400).json({ error: 'Already approved' });
    user.approved = true;
    saveUsers(users);
    if (user.profileData) {
        let profiles = getProfiles();
        if (!profiles.find(p => p.userId === user.id)) {
            profiles.push({
                id: profiles.length ? Math.max(...profiles.map(p => p.id)) + 1 : 1,
                userId: user.id,
                name: user.profileData.name,
                age: user.profileData.age,
                gender: user.profileData.gender,
                language: user.profileData.language || '',
                country: user.profileData.country || '',
                whatsapp: user.profileData.whatsapp || '',
                facebook: user.profileData.facebook || '',
                instagram: user.profileData.instagram || '',
                pinterest: user.profileData.pinterest || '',
                picture: user.profileData.picture || '',
                exported: false,
                createdAt: new Date().toISOString()
            });
            saveProfiles(profiles);
        }
    }
    res.json({ message: 'User approved' });
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let users = getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'User not found' });
    let profiles = getProfiles();
    profiles = profiles.filter(p => p.userId !== id);
    saveProfiles(profiles);
    users.splice(index, 1);
    saveUsers(users);
    res.json({ message: 'User deleted' });
});

app.put('/api/admin/users/:id/promote', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let users = getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Already admin' });
    user.role = 'admin';
    user.approved = true;
    saveUsers(users);
    res.json({ message: 'User promoted' });
});

// ─── ADMIN REPORTS ───

app.get('/api/admin/reports', authenticate, requireAdmin, (req, res) => {
    const reports = getReports();
    const profiles = getProfiles();
    const enriched = reports.map(r => ({
        ...r,
        profileName: profiles.find(p => p.id === r.profileId)?.name || 'Deleted Profile'
    }));
    res.json(enriched);
});

app.put('/api/admin/reports/:id/resolve', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let reports = getReports();
    const report = reports.find(r => r.id === id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    report.status = 'resolved';
    saveReports(reports);
    res.json({ message: 'Report resolved' });
});

// ─── ADMIN CHATS ───

app.get('/api/admin/chats', authenticate, requireAdmin, (req, res) => {
    const chats = getChats();
    const users = getUsers();
    const enriched = chats.map(c => ({
        ...c,
        username: users.find(u => u.id === c.userId)?.username || 'Deleted User'
    }));
    res.json(enriched);
});

app.post('/api/admin/chats/:id/reply', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const { message } = req.body;
    if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required' });
    let chats = getChats();
    const chat = chats.find(c => c.id === id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.messages.push({
        sender: 'admin',
        senderName: 'Admin',
        message: message.trim(),
        timestamp: new Date().toISOString()
    });
    chat.status = 'open';
    saveChats(chats);
    res.json(chat);
});

app.put('/api/admin/chats/:id/resolve', authenticate, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let chats = getChats();
    const chat = chats.find(c => c.id === id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.status = 'resolved';
    saveChats(chats);
    res.json({ message: 'Chat resolved' });
});

// ─── USER CHAT ───

app.get('/api/chat/me', authenticate, (req, res) => {
    let chats = getChats();
    let chat = chats.find(c => c.userId === req.user.id);
    if (!chat) {
        chat = {
            id: chats.length ? Math.max(...chats.map(c => c.id)) + 1 : 1,
            userId: req.user.id,
            username: req.user.username,
            status: 'open',
            messages: [],
            createdAt: new Date().toISOString()
        };
        chats.push(chat);
        saveChats(chats);
    }
    res.json(chat);
});

app.post('/api/chat/send', authenticate, (req, res) => {
    const { message } = req.body;
    if (!message || message.trim().length < 1) return res.status(400).json({ error: 'Message required' });
    let chats = getChats();
    let chat = chats.find(c => c.userId === req.user.id);
    if (!chat) {
        chat = {
            id: chats.length ? Math.max(...chats.map(c => c.id)) + 1 : 1,
            userId: req.user.id,
            username: req.user.username,
            status: 'open',
            messages: [],
            createdAt: new Date().toISOString()
        };
        chats.push(chat);
    }
    chat.messages.push({
        sender: 'user',
        senderName: req.user.username,
        message: message.trim(),
        timestamp: new Date().toISOString()
    });
    chat.status = 'open';
    saveChats(chats);
    res.json(chat);
});

// ─── ADMIN EXPORT ───

app.post('/api/admin/export', authenticate, requireAdmin, (req, res) => {
    let profiles = getProfiles();
    const toExport = profiles.filter(p => !p.exported);
    if (toExport.length === 0) return res.json({ message: 'No new profiles', profiles: [] });
    profiles = profiles.map(p => { if (!p.exported) p.exported = true; return p; });
    saveProfiles(profiles);
    res.json({ profiles: toExport, count: toExport.length });
});

// ── Serve uploads ──
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Start server ──
app.listen(PORT, () => {
    console.log(`💕 HeartConnect running at http://localhost:${PORT}`);
});