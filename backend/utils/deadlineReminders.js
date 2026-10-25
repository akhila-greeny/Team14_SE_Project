
const { listDrives } = require('../data/drivesStore');
const { notifyAllStudents } = require('../data/notificationsStore');

const reminded = new Set(); // drives we already reminded about
const DAY_MS = 24 * 60 * 60 * 1000;

// Sends one reminder per drive whose deadline is within the next 24 hours.
function checkDeadlineReminders(now = new Date()) {
  let count = 0;
  for (const d of listDrives()) {
    const msLeft = new Date(d.deadline) - now;
    if (msLeft > 0 && msLeft <= DAY_MS && !reminded.has(d.id)) {
      reminded.add(d.id);
      notifyAllStudents(
        'deadline_reminder',
        `Deadline approaching: ${d.company} (${d.role}) closes on ${new Date(d.deadline).toLocaleString()}`,
        { driveId: d.id }
      );
      count++;
    }
  }
  return count;
}

module.exports = { checkDeadlineReminders };
