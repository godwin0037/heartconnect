const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { reverseGeocode } = require('../utils/geo');
const { evaluateRisk } = require('../utils/risk');

const router = express.Router();

/* ---------------------------------------------------------
   POST /api/location/precise  - store precise browser geolocation
   Body: { lat, lon, accuracy }
--------------------------------------------------------- */
router.post('/precise', requireAuth, async (req, res) => {
  try {
    const { lat, lon, accuracy } = req.body;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat and lon must be numbers' });
    }

    const { country, city } = await reverseGeocode(lat, lon);

    req.user.locationHistory.push({
      type: 'precise',
      lat,
      lon,
      accuracy,
      country,
      city,
    });

    await evaluateRisk(req.user);
    await req.user.save();

    res.json({ message: 'Location saved', country, city });
  } catch (err) {
    console.error('Precise location error:', err);
    res.status(500).json({ error: 'Could not save location' });
  }
});

module.exports = router;
