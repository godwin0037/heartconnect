const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const User = require('../models/User');
const Profile = require('../models/Profile');
const Report = require('../models/Report');
const Chat = require('../models/Chat');
const Notice = require('../models/Notice');
const DeletedUser = require('../models/DeletedUser');
const AdminLog = require('../models/AdminLog');
const { cloudinary, publicIdFromUrl } = require('../config/cloudinary');
const Like = require('../models/Like');

const router = express.Router();

router.use(requireAuth, requireAdmin);

async function logAction(adminId, action, targetUserId, reason) {
  await AdminLog.create({ adminId, action, targetUserId, reason });
}

/* ================= USERS TAB ================= */
router.get('/users', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  const profiles = await Profile.find().select('userId exported');
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  res.json(
    users.map((u) => ({
      id: u._id,
      username: u.username,
      role: u.role,
      approved: u.approved,
      hasProfile: profileByUser.has(u._id.toString()),
      exported: profileByUser.get(u._id.toString())?.exported || false,
      createdAt: u.createdAt,
    }))
  );
});

// Approve a pending user -> creates their profile from signup data
router.post('/users/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.approved = true;
    await user.save();

    let profile = await Profile.findOne({ userId: user._id });
    if (!profile && user.profileData?.fullName) {
      profile = await Profile.create({
        userId: user._id,
        fullName: user.profileData.fullName,
        age: user.profileData.age,
        gender: user.profileData.gender,
        language: user.profileData.language,
        country: user.profileData.country,
        profilePicture: user.profileData.profilePicture,
        socialLinks: user.profileData.socialLinks,
        approved: true,
      });
    } else if (profile) {
      profile.approved = true;
      await profile.save();
    }

    await logAction(req.user._id, 'approve_user', user._id);
    res.json({ message: 'User approved', user });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Could not approve user' });
  }
});

// Promote a user to admin
router.post('/users/:id/promote', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.role = 'admin';
  await user.save();
  await logAction(req.user._id, 'promote_user', user._id);
  res.json({ message: 'User promoted to admin', user });
});

// Delete a user (admin-initiated) and all associated data
router.delete('/users/:id', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const profile = await Profile.findOne({ userId: user._id });
    if (profile) {
      await Like.deleteMany({ profileId: profile._id });
      await Report.deleteMany({ profileId: profile._id });
      if (profile.profilePicture) {
        const publicId = publicIdFromUrl(profile.profilePicture);
        if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {});
      }
      await profile.deleteOne();
    }
    await Chat.deleteMany({ userId: user._id });
    await Like.deleteMany({ userId: user._id });

    await DeletedUser.create({
      userId: user._id,
      username: user.username,
      reason: reason || 'Removed by admin',
    });

    await logAction(req.user._id, 'delete_user', user._id, reason);
    await user.deleteOne();

    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Could not delete user' });
  }
});

/* ================= REPORTS TAB ================= */
router.get('/reports', async (req, res) => {
  const reports = await Report.find()
    .sort({ createdAt: -1 })
    .populate('profileId', 'fullName')
    .populate('reporterUserId', 'username');

  res.json(
    reports.map((r) => ({
      id: r._id,
      profileName: r.profileId?.fullName || '(deleted profile)',
      reportedBy: r.reporterUserId?.username || '(deleted user)',
      reason: r.reason,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
    }))
  );
});

router.post('/reports/:id/resolve', async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  report.status = 'resolved';
  await report.save();
  await logAction(req.user._id, 'resolve_report', report.reporterUserId);
  res.json({ message: 'Report resolved' });
});

/* ================= CHATS TAB ================= */
router.get('/chats', async (req, res) => {
  const chats = await Chat.find().sort({ updatedAt: -1 }).populate('userId', 'username');
  res.json(
    chats.map((c) => ({
      id: c._id,
      user: c.userId?.username || '(deleted user)',
      status: c.status,
      lastMessage: c.messages[c.messages.length - 1]?.text || '',
      messages: c.messages,
    }))
  );
});

router.post('/chats/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Reply cannot be empty' });

  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  chat.messages.push({ sender: 'admin', text: text.trim() });
  await chat.save();
  res.json({ message: 'Reply sent', messages: chat.messages });
});

router.post('/chats/:id/resolve', async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  chat.status = 'resolved';
  await chat.save();
  res.json({ message: 'Chat marked resolved' });
});

/* ================= SECURITY TAB ================= */
router.get('/security', async (req, res) => {
  const users = await User.find().select(
    'username riskScore riskFlags socialVerifications locationHistory'
  );

  res.json(
    users.map((u) => {
      const lastLocation = u.locationHistory[u.locationHistory.length - 1];
      return {
        id: u._id,
        username: u.username,
        riskScore: u.riskScore,
        riskFlags: u.riskFlags,
        verified: !!(u.socialVerifications?.facebook?.verified || u.socialVerifications?.instagram?.verified),
        lastLocation: lastLocation
          ? { city: lastLocation.city, country: lastLocation.country, type: lastLocation.type }
          : null,
        locationHistoryCount: u.locationHistory.length,
      };
    })
  );
});

/* ================= NOTICES TAB ================= */
router.get('/notices', async (req, res) => {
  const notices = await Notice.find().sort({ createdAt: -1 });
  res.json(notices);
});

router.post('/notices', async (req, res) => {
  const { message, active } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const notice = await Notice.create({ message: message.trim(), active: !!active });
  res.status(201).json({ message: 'Notice created', notice });
});

router.put('/notices/:id', async (req, res) => {
  const { message, active } = req.body;
  const notice = await Notice.findById(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });

  if (message !== undefined) notice.message = message;
  if (active !== undefined) notice.active = active;
  await notice.save();
  res.json({ message: 'Notice updated', notice });
});

/* ================= DELETIONS TAB ================= */
router.get('/deletions', async (req, res) => {
  const deletions = await DeletedUser.find().sort({ deletedAt: -1 });
  res.json(deletions);
});

/* ================= EXPORT NEW USERS (JSON) ================= */
router.get('/export', async (req, res) => {
  try {
    const profiles = await Profile.find({ exported: false });
    const ids = profiles.map((p) => p._id);

    await Profile.updateMany({ _id: { $in: ids } }, { $set: { exported: true } });
    await logAction(req.user._id, 'export_new_users', null, `${ids.length} profiles`);

    res.setHeader('Content-Disposition', 'attachment; filename="new-users-export.json"');
    res.json(profiles);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Could not export profiles' });
  }
});

module.exports = router;
