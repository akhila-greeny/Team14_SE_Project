// A student is eligible if branch is allowed, CGPA is high enough and backlogs are within the limit.
function isEligible(profile, drive) {
  const e = drive.eligibility;
  const branches = e.branches.map((b) => String(b).trim().toUpperCase());
  const branchOk = branches.includes(String(profile.branch).trim().toUpperCase());
  return branchOk && profile.cgpa >= e.minCgpa && profile.backlogs <= e.maxBacklogs;
}

module.exports = { isEligible };
