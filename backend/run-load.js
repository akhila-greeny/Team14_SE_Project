
const { spawn } = require('child_process');
const path = require('path');

const TOTAL = Number(process.env.TOTAL || 2000); // students in total
const PROCS = Number(process.env.PROCS || 4); // test processes
const per = Math.ceil(TOTAL / PROCS);

const jobs = [];
for (let p = 0; p < PROCS; p++) {
  const users = Math.min(per, TOTAL - p * per);
  if (users <= 0) break;
  jobs.push(
    new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'test-load.js')], {
        env: { ...process.env, USERS: String(users), ID_OFFSET: String(p * per) },
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('close', (code) => resolve({ p, users, out, code }));
    })
  );
}

Promise.all(jobs).then((results) => {
  results.forEach((r) => {
    console.log(`===== Process ${r.p + 1} (${r.users} students) =====`);
    console.log(r.out.trim());
    console.log();
  });
  const pass = results.every((r) => r.code === 0);
  console.log(
    `COMBINED: ${TOTAL} students in ${results.length} processes -> ${pass ? 'PASS' : 'FAIL'} ` +
      `(every process must pass)`
  );
  process.exitCode = pass ? 0 : 1;
});
