const mongoose = require('mongoose');

const locationEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ip', 'precise'], required: true },
    country: String,
    city: String,
    lat: Number,
    lon: Number,
    accuracy: Number,
    isp: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, minlength: 3, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    approved: { type: Boolean, default: false },

    profileData: {
      fullName: String,
      age: Number,
      gender: { type: String, enum: ['Woman', 'Man', 'Non-binary', 'Other'] },
      language: String,
      country: String,
      profilePicture: String,
      socialLinks: {
        whatsapp: String,
        facebook: String,
        instagram: String,
        pinterest: String,
      },
    },

    socialVerifications: {
      facebook: {
        verified: { type: Boolean, default: false },
        socialId: String,
        verifiedAt: Date,
      },
      instagram: {
        verified: { type: Boolean, default: false },
        socialId: String,
        verifiedAt: Date,
      },
    },

    locationHistory: [locationEntrySchema],

    riskScore: { type: Number, default: 0 },
    riskFlags: [{ type: String }],

    exported: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
