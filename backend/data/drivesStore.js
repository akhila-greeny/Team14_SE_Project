
// Temporary in-memory storage for drives.
// Later this file will be replaced by PostgreSQL queries.
const drives = [];
let nextId = 1;

function addDrive(data) {
  const drive = {
    id: nextId++,
    ...data,
    createdAt: new Date().toISOString(),
  };
  drives.push(drive);
  return drive;
}

function listDrives() {
  return drives;
}

module.exports = { addDrive, listDrives };
