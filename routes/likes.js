const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Like = require('../models/Like');
const Profile = require('../models/Profile');

const router = express.Router();

/* ---------------------------------------------------------
   POST /api/likes/:profileId  - toggle like on a profile
--------------------------------------------------------- */
router.post('/:profileId', requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    const profile = await Profile.findById(profileId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const existing = await Like.findOne({ profileId, userId: req.user._id });

    if (existing) {
      await existing.deleteOne();
      profile.likeCount = Math.max(0, profile.likeCount - 1);
      await profile.save();
      return res.json({ liked: false, likeCount: profile.likeCount });
    }

    await Like.create({ profileId, userId: req.user._id });
    profile.likeCount += 1;
    await profile.save();
    return res.json({ liked: true, likeCount: profile.likeCount });
  } catch (err) {
    if (err.code === 11000) {
      // race condition on the unique index - treat as already liked
      return res.status(409).json({ error: 'Like already registered' });
    }
    console.error('Like toggle error:', err);
    res.status(500).json({ error: 'Could not update like' });
  }
});

module.exports = router;
