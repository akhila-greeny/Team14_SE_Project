
const express = require('express');
const requireRole = require('../middleware/requireRole');
const roles = require('../utils/roles');
const { listForStudent, markRead } = require('../data/notificationsStore');
const { checkDeadlineReminders } = require('../utils/deadlineReminders');

const STUDENT = roles.STUDENT || 'Student';
const TPO = roles.TPO || 'TPO';
const router = express.Router();

// Student: my notifications (newest first)
router.get('/notifications', requireRole(STUDENT), (req, res) => {
  res.json(listForStudent(req.user.id));
});

// Student: mark one notification as read
router.patch('/notifications/:id/read', requireRole(STUDENT), (req, res) => {
  const n = markRead(Number(req.params.id), req.user.id);
  if (!n) {
    return res.status(404).json({ error_code: 'NOT_FOUND', message: 'Notification not found' });
  }
  res.json(n);
});

// TPO: run the deadline check now (it also runs automatically every hour)
router.post('/notifications/check-deadlines', requireRole(TPO), (req, res) => {
  res.json({ reminders: checkDeadlineReminders() });
});

module.exports = router;
