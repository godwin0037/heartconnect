const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Notice = require('../models/Notice');

const router = express.Router();

/* ---------------------------------------------------------
   GET /api/notices/active  - fetch the current site-wide notice
--------------------------------------------------------- */
router.get('/active', requireAuth, async (req, res) => {
  try {
    const notice = await Notice.findOne({ active: true }).sort({ updatedAt: -1 });
    res.json({ notice: notice ? { id: notice._id, message: notice.message } : null });
  } catch (err) {
    res.status(500).json({ error: 'Could not load notice' });
  }
});

module.exports = router;
