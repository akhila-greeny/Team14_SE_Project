# OIPP-NF-001 Performance Benchmark Report

**Requirement:** OIPP-NF-001 / GitHub Issue #21  
**Metric:** Response time under 3 seconds for 90% of requests ($p90 \le 3000\text{ ms}$) across representative student and TPO workflows.  
**Evaluation Date:** November 2026  
**Status:** **PASSED** (All endpoints demonstrate $p90 \le 634\text{ ms}$, well below the $3000\text{ ms}$ threshold, with 0% error rate).

---

## 1. Test Environment

* **Operating System:** Windows 11 / Windows Server x64
* **Runtime:** Node.js v22.19.0
* **Web Framework:** Express 5.3.0
* **Data Storage:** In-memory stores (`usersStore.js`, `drivesStore.js`, `profilesStore.js`, `applicationsStore.js`, `notificationsStore.js`)
* **Network Interface:** Local loopback (`127.0.0.1`), HTTP/1.1
* **Authentication:** bcryptjs cost factor 10, JSON Web Tokens (`jsonwebtoken` 9.0.3)

---

## 2. Tested Endpoints & Workflows

Representative endpoints covering standard Student and TPO workflows were evaluated:

| Workflow | Method | Endpoint | Description |
|---|---|---|---|
| Auth / Login | `POST` | `/api/auth/login` | Student login credential verification (bcrypt compare + JWT sign) |
| Student Profile | `GET` | `/api/profile` | Retrieve student profile (authenticated student) |
| Placement Drives | `GET` | `/api/drives/eligible` | Filter placement drives by student branch, CGPA, backlogs |
| Applications | `GET` | `/api/applications` | Retrieve list of applications submitted by the student |
| Notifications | `GET` | `/api/notifications` | Retrieve notifications for student |
| TPO Reports | `GET` | `/api/reports/stats` | TPO placement statistics dashboard and metrics |

---

## 3. Test Methodology & Parameters

* **Tooling:** Reproducible benchmark harness [`backend/benchmark/bench-response-time.js`](../backend/benchmark/bench-response-time.js) and automated test runner [`backend/test-response-time.js`](../backend/test-response-time.js).
* **Requests per Endpoint:** 100 requests per endpoint (600 requests total per benchmark run).
* **Concurrency Level:** 10 parallel requests per batch.
* **Think Time:** 0 ms (back-to-back batch processing).
* **Overall Test Duration:** ~22.6 seconds.
* **Metrics Recorded:** $p50$, $p90$, $p95$, $p99$, Average, Maximum, Errors, Error Rate, and Throughput (req/s).

---

## 4. Benchmark Results

### Baseline Measurements (100 requests/endpoint, Concurrency = 10)

| Endpoint | $n$ | $p50$ (ms) | $p90$ (ms) | $p95$ (ms) | $p99$ (ms) | Max (ms) | Avg (ms) | Errors | Error Rate | Throughput | $p90 \le 3000\text{ ms}$ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `POST /api/auth/login` | 100 | 595 | **634** | 674 | 674 | 678 | 609 | 0 | 0.0% | 16.38 req/s | **PASS** |
| `GET /api/profile` | 100 | 8 | **11** | 13 | 13 | 13 | 9 | 0 | 0.0% | 1093.55 req/s | **PASS** |
| `GET /api/drives/eligible` | 100 | 8 | **8** | 9 | 9 | 9 | 8 | 0 | 0.0% | 1202.97 req/s | **PASS** |
| `GET /api/applications` | 100 | 8 | **10** | 11 | 11 | 11 | 9 | 0 | 0.0% | 1094.23 req/s | **PASS** |
| `GET /api/notifications` | 100 | 9 | **11** | 13 | 13 | 13 | 9 | 0 | 0.0% | 1054.71 req/s | **PASS** |
| `GET /api/reports/stats` | 100 | 9 | **10** | 10 | 10 | 10 | 8 | 0 | 0.0% | 1139.32 req/s | **PASS** |

* **Worst Endpoint $p90$:** **634 ms** (`POST /api/auth/login`)
* **Total HTTP Errors:** **0** (0.0% error rate across all requests)
* **Overall Acceptance Criterion:** **PASSED** (All representative endpoints achieve $p90 \le 3000\text{ ms}$).

---

## 5. Bottleneck Analysis & Optimisation Assessment

1. **CPU Bottleneck in Login (`/api/auth/login`):**
   * The login endpoint exhibits a $p90$ of ~634 ms. This latency is dominated by `bcrypt.compare`, which intentionally uses 10 salt rounds (`SALT_ROUNDS = 10`) to satisfy password security requirements (OIPP-SR-002 / Issue #27). Under concurrency 10 on a single Node.js event loop / libuv threadpool, cryptographic hashing naturally serializes across available worker threads.
   * However, 634 ms is well within the 3000 ms threshold (~21% of the allowed limit). Weakening salt rounds to reduce response time would degrade security and violate Issue #27; therefore, no alteration of the hashing cost factor was made.
2. **In-Memory Query Performance:**
   * All data retrieval endpoints (`/api/profile`, `/api/drives/eligible`, `/api/applications`, `/api/notifications`, `/api/reports/stats`) exhibited sub-15 ms latency ($p90 \le 11\text{ ms}$, throughput $> 1000\text{ req/s}$).
3. **Optimisation Conclusion:**
   * Because the baseline already meets the SRS non-functional requirement with significant margin ($p90 \le 634\text{ ms} \ll 3000\text{ ms}$) and 0 errors, no invasive code refactoring or security compromises were required. Unnecessary rewrites of other members' modules were strictly avoided per Sprint 2 scope rules.

---

## 6. How to Reproduce

Run the full benchmark suite:
```powershell
cd backend
node benchmark/bench-response-time.js --iterations 100 --concurrency 10
```

Run the automated assertion test:
```powershell
cd backend
node test-response-time.js
```

---

## 7. Test Limitations

* **Storage Model:** Benchmarks executed against the Sprint 2 in-memory data store. A future persistent database (e.g., PostgreSQL disk I/O, network pool latency) will introduce additional latency not captured here.
* **Network Simulation:** Tests ran over the local loopback interface (`127.0.0.1`). Real-world mobile or WAN networks with packet loss and high latency are not reflected in loopback numbers.
* **Concurrency Scope:** Evaluated at 10 concurrent requests for response time verification under normal operational load. Large-scale load testing (2,000 concurrent students) is covered independently under Issue #25 (OIPP-NF-005).

