const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Report = require('../models/Report');
const Profile = require('../models/Profile');

const router = express.Router();

const VALID_REASONS = [
  'Fake profile / impersonation',
  'Inappropriate photos',
  'Harassment',
  'Underage suspicion',
  'Other',
];

/* ---------------------------------------------------------
   POST /api/reports/:profileId  - report a profile
--------------------------------------------------------- */
router.post('/:profileId', requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { reason, description } = req.body;

    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Invalid report reason' });
    }

    const profile = await Profile.findById(profileId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const report = await Report.create({
      profileId,
      reporterUserId: req.user._id,
      reason,
      description,
    });

    res.status(201).json({ message: 'Report submitted', report });
  } catch (err) {
    console.error('Report submit error:', err);
    res.status(500).json({ error: 'Could not submit report' });
  }
});

module.exports = router;
