const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: [
        'Fake profile / impersonation',
        'Inappropriate photos',
        'Harassment',
        'Underage suspicion',
        'Other',
      ],
      required: true,
    },
    description: String,
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
