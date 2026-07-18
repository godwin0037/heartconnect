const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

likeSchema.index({ profileId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);
