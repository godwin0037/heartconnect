const User = require('../models/User');

/**
 * Evaluates fraud risk for a given user document and updates
 * user.riskScore / user.riskFlags in place (caller must .save()).
 *
 * Rules:
 *  - Country mismatch between login locations:      +2
 *  - Social account < 7 days old:                    +1
 *  - > 3 accounts from same IP:                       +3
 *  - No social account verified:                      +1
 */
async function evaluateRisk(user) {
  let score = 0;
  const flags = [];

  // Rule 1: country mismatch across recorded locations
  const countries = new Set(
    user.locationHistory.map((l) => l.country).filter(Boolean)
  );
  if (countries.size > 1) {
    score += 2;
    flags.push('country_mismatch');
  }

  // Rule 2: social account verified less than 7 days ago
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const recentlyVerified = ['facebook', 'instagram'].some((platform) => {
    const v = user.socialVerifications?.[platform];
    return v?.verified && v.verifiedAt && now - new Date(v.verifiedAt).getTime() < SEVEN_DAYS;
  });
  if (recentlyVerified) {
    score += 1;
    flags.push('new_social_account');
  }

  // Rule 3: more than 3 accounts sharing the same IP
  const lastIpEntry = [...user.locationHistory].reverse().find((l) => l.type === 'ip' && l.ip);
  if (lastIpEntry?.ip) {
    const sharedIpCount = await User.countDocuments({
      _id: { $ne: user._id },
      'locationHistory.ip': lastIpEntry.ip,
    });
    if (sharedIpCount > 3) {
      score += 3;
      flags.push('shared_ip_cluster');
    }
  }

  // Rule 4: no social account verified at all
  const anyVerified =
    user.socialVerifications?.facebook?.verified || user.socialVerifications?.instagram?.verified;
  if (!anyVerified) {
    score += 1;
    flags.push('no_social_verification');
  }

  user.riskScore = score;
  user.riskFlags = flags;
  return { score, flags };
}

module.exports = { evaluateRisk };
