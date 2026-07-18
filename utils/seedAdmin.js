const bcrypt = require('bcrypt');
const User = require('../models/User');

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await User.findOne({ username });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    username,
    passwordHash,
    role: 'admin',
    approved: true,
  });

  console.log(`👑 Seeded admin account: ${username} / (see .env ADMIN_PASSWORD)`);
}

module.exports = seedAdmin;
