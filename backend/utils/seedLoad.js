
const { addDrive } = require('../data/drivesStore');
const { addApplication } = require('../data/applicationsStore');
const { notifyAllStudents } = require('../data/notificationsStore');

// Creates 10 drives, and 2 applications for each of the students 1..N
function seedLoadDemo(students = 2000) {
  const drives = [];
  for (let i = 1; i <= 10; i++) {
    drives.push(
      addDrive({
        company: `Company ${i}`,
        role: 'Software Engineer',
        package: `${3 + i} LPA`,
        eligibility: { minCgpa: 7, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
        deadline: '2099-12-31',
        postedBy: 2,
      })
    );
  }

  for (let s = 1; s <= students; s++) {
    addApplication(s, drives[s % 10].id);
    addApplication(s, drives[(s + 1) % 10].id);
  }

  drives.forEach((d) =>
    notifyAllStudents('new_drive', `New drive posted: ${d.company} - ${d.role}`, { driveId: d.id })
  );
}

module.exports = { seedLoadDemo };
