
const { addDrive } = require('../data/drivesStore');
const { addApplication, updateApplicationStatus } = require('../data/applicationsStore');

function makeDrive(company, pkg) {
  return addDrive({
    company,
    role: 'Software Engineer',
    package: pkg,
    eligibility: { minCgpa: 7, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
    deadline: '2099-12-31',
    postedBy: 2,
  });
}

function apply(studentId, driveId, status) {
  const app = addApplication(studentId, driveId);
  if (status !== 'applied') updateApplicationStatus(app.id, status, 2);
}

// Creates 3 drives and 6 applications:
//   Infosys 6 LPA: student 1 selected, student 2 shortlisted, student 3 rejected
//   TCS 4 LPA:     student 1 applied,  student 2 selected
//   Wipro 3.5 LPA: student 4 applied
function seedStatsDemo() {
  const infosys = makeDrive('Infosys', '6 LPA');
  const tcs = makeDrive('TCS', '4 LPA');
  const wipro = makeDrive('Wipro', '3.5 LPA');

  apply(1, infosys.id, 'selected');
  apply(2, infosys.id, 'shortlisted');
  apply(3, infosys.id, 'rejected');
  apply(1, tcs.id, 'applied');
  apply(2, tcs.id, 'selected');
  apply(4, wipro.id, 'applied');
}

module.exports = { seedStatsDemo };
