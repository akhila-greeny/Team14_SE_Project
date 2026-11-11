// OIPP-F-015: mock-interview slots offered by peers or seniors.
// Temporary in-memory storage, same approach as drivesStore.js.
// A reviewer is any student account (a peer or a senior) who offers a slot.
// Once booked, a slot is the mock-interview session for both people.
const slots = [];
let nextId = 1;

function addSlot({ reviewerId, reviewerName, startsAt, durationMinutes = 30 }) {
  const slot = {
    id: nextId++,
    reviewerId,
    reviewerName: reviewerName || `Reviewer ${reviewerId}`,
    startsAt: new Date(startsAt).toISOString(),
    durationMinutes,
    status: 'open', // open -> booked
    studentId: null,
    bookedAt: null,
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

// Seed: three upcoming slots from two senior students (ids 201, 202).
const day = 24 * 60 * 60 * 1000;
const tomorrow10am = new Date(Date.now() + day);
tomorrow10am.setHours(10, 0, 0, 0);
addSlot({ reviewerId: 201, reviewerName: 'Senior: Rahul (final year)', startsAt: tomorrow10am });
addSlot({ reviewerId: 201, reviewerName: 'Senior: Rahul (final year)', startsAt: tomorrow10am.getTime() + day });
addSlot({ reviewerId: 202, reviewerName: 'Senior: Meera (final year)', startsAt: tomorrow10am.getTime() + 2 * day, durationMinutes: 45 });

module.exports = { addSlot, getSlot, listSlots };
