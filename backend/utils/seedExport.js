
const { addDrive } = require('../data/drivesStore');
const { addApplication, updateApplicationStatus } = require('../data/applicationsStore');
const { saveProfile } = require('../data/profilesStore');

function makeDrive(company) {
  return addDrive({
    company,
    role: 'Software Engineer',
    package: '6 LPA',
    eligibility: { minCgpa: 7, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
    deadline: '2099-12-31',
    postedBy: 2,
  });
}

function apply(studentId, driveId, status) {
  const app = addApplication(studentId, driveId);
  if (status !== 'applied') updateApplicationStatus(app.id, status, 2);
}

// Drive 1 (Infosys): 3 applicants, Drive 2 (TCS): 1 applicant, Drive 3 (Wipro): none
function seedExportDemo() {
  const infosys = makeDrive('Infosys');
  const tcs = makeDrive('TCS');
  makeDrive('Wipro');

  // Student 1 has a user account (student@stu.pes.edu); the name has a comma on purpose
  saveProfile(1, { name: 'Rao, Aditi', branch: 'CSE', cgpa: 8.7, backlogs: 0 });
  // Student 3: the name starts with "=" on purpose (formula test)
  saveProfile(3, { name: '=2+2', branch: 'ISE', cgpa: 7.9, backlogs: 0 });
  // Student 4 has no profile at all

  apply(1, infosys.id, 'shortlisted');
  apply(3, infosys.id, 'applied');
  apply(4, infosys.id, 'selected');
  apply(1, tcs.id, 'applied');
}

module.exports = { seedExportDemo };
