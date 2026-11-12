const slots = [];
let nextId = 1;

function addSlot({ reviewerId, reviewerName, startsAt, durationMinutes = 30 }) {
  const slot = {
    id: nextId++,
    reviewerId,
    reviewerName: reviewerName || 'TPO',
    startsAt: new Date(startsAt).toISOString(),
    durationMinutes,
    status: 'open',
    studentId: null,
    bookedAt: null,
    completedAt: null,
    feedback: null,
  };
  slots.push(slot);
  return slot;
}

function getSlot(id) {
  return slots.find((s) => s.id === Number(id)) || null;
}

function listSlots() {
  return slots;
}

module.exports = { addSlot, getSlot, listSlots };
