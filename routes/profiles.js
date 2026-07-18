const express = require('express');
const { cloudinary, publicIdFromUrl } = require('../config/cloudinary');
const upload = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

const User = require('../models/User');
const Profile = require('../models/Profile');
const Like = require('../models/Like');
const Report = require('../models/Report');
const Chat = require('../models/Chat');
const DeletedUser = require('../models/DeletedUser');

const router = express.Router();

/* ---------------------------------------------------------
   GET /api/profiles  - public grid (search, filter, sort, paginate)
--------------------------------------------------------- */
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      search = '',
      gender = '',
      minAge,
      maxAge,
      sort = 'newest',
      page = 1,
    } = req.query;

    const perPage = 24;
    const query = { approved: true };

    if (search) query.fullName = { $regex: search, $options: 'i' };
    if (gender) query.gender = gender;
    if (minAge || maxAge) {
      query.age = {};
      if (minAge) query.age.$gte = parseInt(minAge, 10);
      if (maxAge) query.age.$lte = parseInt(maxAge, 10);
    }

    let sortSpec = { createdAt: -1 }; // newest first (default)
    if (sort === 'oldest') sortSpec = { createdAt: 1 };
    else if (sort === 'liked') sortSpec = { likeCount: -1 };
    else if (sort === 'age-asc') sortSpec = { age: 1 };
    else if (sort === 'age-desc') sortSpec = { age: -1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const total = await Profile.countDocuments(query);
    const profiles = await Profile.find(query)
      .sort(sortSpec)
      .skip((pageNum - 1) * perPage)
      .limit(perPage)
      .populate('userId', 'socialVerifications');

    const likedByMe = await Like.find({ userId: req.user._id }).select('profileId');
    const likedSet = new Set(likedByMe.map((l) => l.profileId.toString()));

    const results = profiles.map((p) => ({
      id: p._id,
      fullName: p.fullName,
      age: p.age,
      gender: p.gender,
      language: p.language,
      country: p.country,
      profilePicture: p.profilePicture,
      likeCount: p.likeCount,
      likedByMe: likedSet.has(p._id.toString()),
      verified: !!(p.userId?.socialVerifications?.facebook?.verified || p.userId?.socialVerifications?.instagram?.verified),
      isOwn: p.userId?._id?.toString() === req.user._id.toString(),
    }));

    res.json({
      profiles: results,
      page: pageNum,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      total,
    });
  } catch (err) {
    console.error('Grid fetch error:', err);
    res.status(500).json({ error: 'Could not load profiles' });
  }
});

/* ---------------------------------------------------------
   GET /api/profiles/:id  - single profile detail
--------------------------------------------------------- */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).populate('userId', 'socialVerifications');
    if (!profile || !profile.approved) return res.status(404).json({ error: 'Profile not found' });

    const liked = await Like.findOne({ profileId: profile._id, userId: req.user._id });

    res.json({
      id: profile._id,
      fullName: profile.fullName,
      age: profile.age,
      gender: profile.gender,
      language: profile.language,
      country: profile.country,
      profilePicture: profile.profilePicture,
      socialLinks: profile.socialLinks,
      likeCount: profile.likeCount,
      likedByMe: !!liked,
      verified: !!(profile.userId?.socialVerifications?.facebook?.verified || profile.userId?.socialVerifications?.instagram?.verified),
      isOwn: profile.userId?._id?.toString() === req.user._id.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load profile' });
  }
});

/* ---------------------------------------------------------
   POST /api/profiles  - create the current user's profile
   (only allowed once; used right after signup approval)
--------------------------------------------------------- */
router.post('/', requireAuth, upload.single('profilePicture'), async (req, res) => {
  try {
    const existing = await Profile.findOne({ userId: req.user._id });
    if (existing) return res.status(409).json({ error: 'You already have a profile - use edit instead' });

    const { fullName, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;

    if (!fullName || !age || !gender) {
      return res.status(400).json({ error: 'Full name, age, and gender are required' });
    }
    if (!whatsapp && !facebook && !instagram && !pinterest) {
      return res.status(400).json({ error: 'At least one social link is required' });
    }

    const picture = req.file ? req.file.path : req.user.profileData?.profilePicture;
    if (!picture) return res.status(400).json({ error: 'A profile picture is required' });

    const profile = await Profile.create({
      userId: req.user._id,
      fullName,
      age: parseInt(age, 10),
      gender,
      language,
      country,
      profilePicture: picture,
      socialLinks: { whatsapp, facebook, instagram, pinterest },
      approved: req.user.approved,
    });

    res.status(201).json({ message: 'Profile created', profile });
  } catch (err) {
    console.error('Profile create error:', err);
    res.status(500).json({ error: 'Could not create profile' });
  }
});

/* ---------------------------------------------------------
   PUT /api/profiles/me  - edit own profile (Settings)
--------------------------------------------------------- */
router.put('/me/update', requireAuth, upload.single('profilePicture'), async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'No profile to update yet' });

    const { fullName, age, gender, language, country, whatsapp, facebook, instagram, pinterest } = req.body;

    if (fullName) profile.fullName = fullName;
    if (age) profile.age = parseInt(age, 10);
    if (gender) profile.gender = gender;
    if (language !== undefined) profile.language = language;
    if (country !== undefined) profile.country = country;
    profile.socialLinks = {
      whatsapp: whatsapp ?? profile.socialLinks.whatsapp,
      facebook: facebook ?? profile.socialLinks.facebook,
      instagram: instagram ?? profile.socialLinks.instagram,
      pinterest: pinterest ?? profile.socialLinks.pinterest,
    };

    if (req.file) {
      const oldPublicId = publicIdFromUrl(profile.profilePicture);
      profile.profilePicture = req.file.path;
      if (oldPublicId) {
        cloudinary.uploader.destroy(oldPublicId).catch((e) => console.warn('Cloudinary cleanup failed:', e.message));
      }
    }

    await profile.save();

    // keep User.profileData in sync
    req.user.profileData = {
      ...req.user.profileData,
      fullName: profile.fullName,
      age: profile.age,
      gender: profile.gender,
      language: profile.language,
      country: profile.country,
      profilePicture: profile.profilePicture,
      socialLinks: profile.socialLinks,
    };
    await req.user.save();

    res.json({ message: 'Profile updated', profile });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

/* ---------------------------------------------------------
   DELETE /api/profiles/me  - delete own account entirely
--------------------------------------------------------- */
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.user._id;

    const profile = await Profile.findOne({ userId });
    if (profile) {
      await Like.deleteMany({ profileId: profile._id });
      await Report.deleteMany({ profileId: profile._id });
      if (profile.profilePicture) {
        const publicId = publicIdFromUrl(profile.profilePicture);
        if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {});
      }
      await profile.deleteOne();
    }
    await Chat.deleteMany({ userId });
    await Like.deleteMany({ userId }); // likes this user gave to others

    await DeletedUser.create({
      userId,
      username: req.user.username,
      reason: reason || 'Not specified',
    });

    await req.user.deleteOne();

    res.json({ message: 'Your account has been deleted' });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Could not delete account' });
  }
});

module.exports = router;
