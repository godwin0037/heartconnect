const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
