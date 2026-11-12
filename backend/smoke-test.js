// Smoke test: node smoke-test.js [baseUrl]
// Checks a running server answers. Used by the pipeline against the built
// Docker container before the image is published.
const base = process.argv[2] || 'http://localhost:3000';

async function main() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        console.log(`PASS  GET /api/health -> ${res.status}`, JSON.stringify(await res.json()).slice(0, 120));
        const guarded = await fetch(`${base}/api/mock-tests`);
        if (guarded.status !== 401) throw new Error(`expected 401 when unauthenticated, got ${guarded.status}`);
        console.log('PASS  GET /api/mock-tests unauthenticated -> 401');
        return;
      }
    } catch (err) {
      if (String(err.message).startsWith('expected')) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000)); // server still starting
  }
  throw new Error(`server at ${base} did not become healthy in 20 s`);
}

main().catch((err) => {
  console.error('FAIL ', err.message);
  process.exit(1);
});
