const fs = require('fs');
const bcrypt = require('bcrypt');

const USERS_FILE = './data/users.json';
const NEW_PASSWORD = 'godwin@emma.2';  // Change this to your new password

// Read users
const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

// Find admin
const adminIndex = users.findIndex(u => u.role === 'admin');
if (adminIndex === -1) {
    console.log('❌ Admin user not found.');
    process.exit(1);
}

// Hash new password
bcrypt.hash(NEW_PASSWORD, 10, (err, hash) => {
    if (err) {
        console.error('Error hashing password:', err);
        process.exit(1);
    }
    // Update password
    users[adminIndex].password = hash;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`✅ Admin password updated to: ${NEW_PASSWORD}`);
});