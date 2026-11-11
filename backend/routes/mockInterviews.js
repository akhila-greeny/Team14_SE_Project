const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { addSlot, getSlot, listSlots } = require('../data/mockInterviewsStore');

const router = express.Router();

const byStartTime = (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt);

// OIPP-F-015: GET /api/mock-interviews/slots -> open slots in the future
router.get('/slots', requireRole(STUDENT), (req, res) => {
  const now = Date.now();
  res.json(listSlots().filter((s) => s.status === 'open' && Date.parse(s.startsAt) > now).sort(byStartTime));
});

// POST /api/mock-interviews/slots  body: { startsAt, durationMinutes, reviewerName }
// A peer or senior offers a slot. They become the reviewer for it.
router.post('/slots', requireRole(STUDENT), (req, res) => {
  const { startsAt, durationMinutes = 30, reviewerName } = req.body || {};
  const start = Date.parse(startsAt);
  if (!startsAt || Number.isNaN(start)) {
    return res.status(400).json({ error_code: 'INVALID_START', message: 'startsAt must be a valid date and time' });
  }
  if (start <= Date.now()) {
    return res.status(400).json({ error_code: 'START_IN_PAST', message: 'The slot must be in the future' });
  }
  const minutes = Number(durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 120) {
    return res.status(400).json({ error_code: 'INVALID_DURATION', message: 'durationMinutes must be between 15 and 120' });
  }
  res.status(201).json(addSlot({ reviewerId: req.user.id, reviewerName, startsAt, durationMinutes: minutes }));
});

// POST /api/mock-interviews/slots/:id/book -> the logged-in student books it
router.post('/slots/:id/book', requireRole(STUDENT), (req, res) => {
  const slot = getSlot(req.params.id);
  if (!slot) return res.status(404).json({ error_code: 'SLOT_NOT_FOUND', message: 'Slot not found' });
  if (slot.reviewerId === req.user.id) {
    return res.status(400).json({ error_code: 'OWN_SLOT', message: 'You cannot book your own slot' });
  }
  if (slot.status !== 'open') {
    return res.status(409).json({ error_code: 'SLOT_TAKEN', message: 'This slot is already booked' });
  }
  if (Date.parse(slot.startsAt) <= Date.now()) {
    return res.status(409).json({ error_code: 'SLOT_PASSED', message: 'This slot has already started' });
  }
  slot.status = 'booked';
  slot.studentId = req.user.id;
  slot.bookedAt = new Date().toISOString();
  res.status(201).json(slot);
});

// AC-015: GET /api/mock-interviews/schedule
// Booked sessions where the logged-in user is the student OR the reviewer,
// so one booking shows up on both people's schedules.
router.get('/schedule', requireRole(STUDENT), (req, res) => {
  const me = req.user.id;
  const sessions = listSlots()
    .filter((s) => s.status !== 'open' && (s.studentId === me || s.reviewerId === me))
    .sort(byStartTime)
    .map((s) => ({ ...s, myRole: s.reviewerId === me ? 'reviewer' : 'student' }));
  res.json(sessions);
});

module.exports = router;
