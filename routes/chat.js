const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Chat = require('../models/Chat');

const router = express.Router();

/* ---------------------------------------------------------
   GET /api/chat/me  - fetch (or lazily create) the current
   user's support chat thread. Frontend polls this every 10s.
--------------------------------------------------------- */
router.get('/me', requireAuth, async (req, res) => {
  try {
    let chat = await Chat.findOne({ userId: req.user._id });
    if (!chat) {
      chat = await Chat.create({ userId: req.user._id, messages: [] });
    }
    res.json({ id: chat._id, messages: chat.messages, status: chat.status });
  } catch (err) {
    res.status(500).json({ error: 'Could not load chat' });
  }
});

/* ---------------------------------------------------------
   POST /api/chat/me  - send a message as the user
--------------------------------------------------------- */
router.post('/me', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

    let chat = await Chat.findOne({ userId: req.user._id });
    if (!chat) chat = new Chat({ userId: req.user._id, messages: [] });

    chat.messages.push({ sender: 'user', text: text.trim() });
    if (chat.status === 'resolved') chat.status = 'open'; // reopen on new message
    await chat.save();

    res.status(201).json({ messages: chat.messages, status: chat.status });
  } catch (err) {
    console.error('Chat send error:', err);
    res.status(500).json({ error: 'Could not send message' });
  }
});

module.exports = router;
