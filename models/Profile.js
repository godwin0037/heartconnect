const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true },
    age: { type: Number, required: true, min: 18, max: 99 },
    gender: { type: String, enum: ['Woman', 'Man', 'Non-binary', 'Other'], required: true },
    language: String,
    country: String,
    profilePicture: { type: String, required: true },
    socialLinks: {
      whatsapp: String,
      facebook: String,
      instagram: String,
      pinterest: String,
    },
    likeCount: { type: Number, default: 0 },
    exported: { type: Boolean, default: false },
    approved: { type: Boolean, default: true }, // mirrors User.approved for grid queries
  },
  { timestamps: true }
);

profileSchema.index({ fullName: 'text' });

module.exports = mongoose.model('Profile', profileSchema);
