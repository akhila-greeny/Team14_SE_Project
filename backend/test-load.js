
const jwt = require('jsonwebtoken');
const roles = require('./utils/roles');

const secret = process.env.JWT_SECRET || 'dev-secret';
const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
const USERS = Number(process.env.USERS || 2000); // virtual students
const ROUNDS = 3; // how many times each student repeats the pages
const RAMP_MS = 5000; // students join gradually over 5 seconds
const THINK_MS = 500; // pause between rounds, like a real person
const LIMIT_MS = 3000; // NF-005: 90% of responses within 3 seconds

const ENDPOINTS = [
  { name: 'My applications', path: '/applications' },
  { name: 'My notifications', path: '/notifications' },
];

const results = []; // { name, ms, ok }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hit(endpoint, token) {
  const start = performance.now();
  let ok = false;
  try {
    const res = await fetch(BASE + endpoint.path, {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(30000),
    });
    await res.arrayBuffer(); // read the whole response
    ok = res.status === 200;
  } catch (err) {
    ok = false;
  }
  results.push({ name: endpoint.name, ms: performance.now() - start, ok });
}

async function student(i) {
  await sleep((i / USERS) * RAMP_MS);
  const token = jwt.sign({ id: i, role: roles.STUDENT || 'Student' }, secret);
  for (let r = 0; r < ROUNDS; r++) {
    for (const e of ENDPOINTS) await hit(e, token);
    await sleep(THINK_MS);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summary(label, rows) {
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const errors = rows.filter((r) => !r.ok).length;
  const p90 = percentile(times, 90);
  console.log(
    `${label.padEnd(18)} requests: ${String(rows.length).padEnd(6)} ` +
      `p50: ${percentile(times, 50).toFixed(0).padStart(5)} ms  ` +
      `p90: ${p90.toFixed(0).padStart(5)} ms  ` +
      `p95: ${percentile(times, 95).toFixed(0).padStart(5)} ms  ` +
      `max: ${(times[times.length - 1] || 0).toFixed(0).padStart(5)} ms  ` +
      `errors: ${errors}`
  );
  return { p90, errors };
}

(async () => {
  console.log(`Simulating ${USERS} concurrent students against ${BASE} ...`);
  const start = performance.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => student(i + 1)));
  const seconds = (performance.now() - start) / 1000;

  console.log(`\nFinished in ${seconds.toFixed(1)} s, ${results.length} requests\n`);
  ENDPOINTS.forEach((e) => summary(e.name, results.filter((r) => r.name === e.name)));
  const overall = summary('OVERALL', results);

  const pass = overall.errors === 0 && overall.p90 <= LIMIT_MS;
  console.log(
    `\nRESULT: ${pass ? 'PASS' : 'FAIL'} ` +
      `(p90 ${overall.p90.toFixed(0)} ms, limit ${LIMIT_MS} ms, errors ${overall.errors})`
  );
})();
