# CI/CD pipeline

File: `.github/workflows/ci-cd.yml` (GitHub Actions). See the **Actions** tab on GitHub for every run.

## When it runs

| Event | What runs |
|---|---|
| Pull request into `main` | CI: test + Docker build + smoke test (nothing is published) |
| Push / merge to `main` | CI, then CD: publish the image, then deploy (if configured) |
| "Run workflow" button | Same as a push, on demand |

A newer push to the same branch cancels the older run (`concurrency`).

## Stages

```
test (Node 20)  ┐
test (Node 22)  ┴─> docker: build image -> run container -> smoke test -> [main] push to GHCR -> deploy
```

1. **test** (matrix: Node 20 and 22, run in parallel)
   - `npm ci`: installs the exact versions from `package-lock.json`
   - `node --check` on every `.js` file: catches syntax errors
   - `npm test` -> `backend/run-tests.js`: runs 16 self-checking test files; any failure fails the job
2. **docker** (only if both test jobs pass)
   - builds `backend/Dockerfile` (Node 22 Alpine, production dependencies only, runs as non-root `node` user)
   - starts the container and runs `backend/smoke-test.js` (`/api/health` is 200, a protected route is 401)
   - on `main` only: pushes `ghcr.io/akhila-greeny/team14_se_project/backend:latest` and `:<commit sha>`
3. **deploy** (on `main` only)
   - if the repository secret `DEPLOY_HOOK_URL` is set (e.g. a Render deploy hook), it calls it so the host pulls the new image
   - otherwise it just notes that the image was published

## Run the same checks locally

```bash
cd backend
npm ci
npm test                          # same as the CI test stage
node server.js &                  # then, in another tab:
node smoke-test.js http://localhost:3000
```

## Turning on automatic deployment (optional)

1. Create a web service on a host that can run a Docker image (e.g. Render), using image
   `ghcr.io/akhila-greeny/team14_se_project/backend:latest`, port 3000.
   The GHCR package must be public, or the host given read access.
2. Copy the service's deploy hook URL.
3. GitHub -> repo Settings -> Secrets and variables -> Actions -> New secret: `DEPLOY_HOOK_URL`.
