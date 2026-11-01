# OIPP-NF-002 Monthly Availability Monitoring Report

**Requirement:** OIPP-NF-002 / GitHub Issue #22  
**Target Metric:** 99% monthly availability ($\ge 99.0\%$ reachable uptime over a calendar month).  
**Evaluation Date:** November 2026  
**Status:** **Monitoring Implemented and Validated; 30-Day Production Observation Pending.**

---

## 1. Executive Summary

The Online Internship & Placement Preparation Portal (OIPP) requires 99% monthly availability per SRS section 3.2. Under a standard 30-day calendar month (720 hours / 43,200 minutes), a 99.0% availability SLA permits a maximum cumulative downtime of **7.2 hours (432 minutes)** across all planned and unplanned outages.

In Sprint 2, a complete synthetic availability monitoring subsystem was engineered:
1. A lightweight health-check endpoint (`GET /api/health`) that verifies HTTP server responsiveness and underlying data store accessibility.
2. A synthetic availability monitor (`backend/utils/availabilityMonitor.js`) that actively probes the service, records timestamps, tracks response times, isolates downtime incidents, and computes availability percentages.
3. An availability metrics endpoint (`GET /api/health/availability`) providing real-time SLA metrics.
4. An automated test suite (`backend/test-availability.js`) validating 20 discrete scenarios including fault injection and SLA thresholds.

---

## 2. Monitoring Mechanism Implemented

Rather than relying purely on passive process uptime (which cannot detect hung event loops, network partition, or unhandled promise rejections), the portal uses an **active synthetic monitoring** architecture:

* **Health Check Probe:** The monitor sends synthetic HTTP/HTTPS requests to `GET /api/health` at a configurable interval (default: 60 seconds) with a strict 5-second timeout.
* **Health Criteria:** A check is classified as **`UP`** only if:
  1. The TCP/TLS handshake succeeds.
  2. The server returns HTTP status 200 within 5,000 ms.
  3. The response body is valid JSON with `status === "UP"` and all subsystems reporting operational status.
* **Failure Classification:** A check is classified as **`DOWN`** if any of the following occur:
  * Connection refused (`ECONNREFUSED`).
  * Request timeout ($> 5000\text{ ms}$).
  * HTTP 5xx or 4xx response.
  * Corrupted response body or degraded subsystem status.
* **Incident Tracking:** Consecutive `DOWN` checks are grouped into a single downtime incident with an initial timestamp, end timestamp upon recovery, duration in seconds, and root-cause error message.
* **Availability Calculation:**
  $$\text{Availability (\%)} = \left(\frac{\text{Successful Checks}}{\text{Total Checks}}\right) \times 100$$
  $$\text{Downtime (seconds)} = \sum \text{Incident Durations}$$

---

## 3. Actual Observation Period & Measured Data

### A. Development & Test Run Observations
* **Total Automated Test Probes:** 200+ synthetic requests executed across test suites.
* **Measured Unplanned Downtime:** **0 seconds**.
* **Measured Operational Uptime:** **100.0%**.
* **Simulated Fault Injection:** 1 simulated incident (60 seconds) injected during automated test suite to verify threshold alert (`meetsSla = false` at 50% / 66.6%, and `meetsSla = true` at 99.0% and 100.0%).

### B. Summary of Observation Metrics

| Metric | Measured Value | Notes |
|---|---|---|
| Monitoring Mechanism | Synthetic HTTP Probes | Active verification of request serving |
| Observation Period (Testing) | Test session runtimes | Multiple test executions and benchmarks |
| Measured Uptime | 100.0% | Zero unplanned failures during active execution |
| Measured Downtime | 0 s (unplanned) | 60 s under controlled fault injection |
| Calculated Availability | 100.0% (operational) | 99.0% in controlled 100-probe benchmark |
| SLA Target | $\ge 99.0\%$ | SRS OIPP-NF-002 specification |

---

## 4. Whether the 99% Requirement Has Been Demonstrated

* **Monitoring Functionality Demonstrated:** **YES.** The synthetic probe, downtime tracking, incident grouping, and availability percentage calculations are fully implemented and verified by automated tests.
* **SLA Threshold Calculation Validated:** **YES.** Boundary conditions ($0\%$, $50\%$, $99.0\%$, and $100.0\%$) and recovery transitions are verified.
* **30-Day Continuous Production Requirement:** **PENDING 30-DAY OPERATIONAL RUN.** Per the strict guidelines of this project:
  > *A claim of 99% monthly availability cannot be made based on code implementation alone; it requires observing the service in continuous production operation over a full 30-day calendar period.*

During the active development and testing phase, the application achieved **100% availability** with zero crashes. Formal certification of the 30-day monthly target requires running the server with `defaultMonitor.start()` continuously in a production environment for 30 consecutive days.

---

## 5. Monitoring Methodology

1. **Synthetic Endpoint Probing:** Periodic `GET` requests issued from the monitor to `/api/health`.
2. **Safe Error Handling:** Probe errors never throw uncaught exceptions; errors are captured in the check history.
3. **Timer Unref:** In Node.js, `timer.unref()` is called on background intervals so monitoring does not prevent clean process shutdown or hang test runners.
4. **Endpoint Exposure:** Metrics are queryable by administrators or TPOs at `GET /api/health/availability`:
   ```json
   {
     "availabilityPercentage": 100.0,
     "totalChecks": 60,
     "successfulChecks": 60,
     "failedChecks": 0,
     "uptimeSeconds": 3600,
     "downtimeSeconds": 0,
     "slaTarget": 99.0,
     "meetsSla": true,
     "incidents": []
   }
   ```

---

## 6. Monitoring Limitations

1. **In-Memory Volatility:** In accordance with the Sprint 2 architecture, check logs and incident records are retained in memory (`MAX_HISTORY_LENGTH = 1000`). Restarting the server resets the historical counters. For persistent long-term multi-month auditing, check records should be written to persistent log files or a time-series database.
2. **Single-Host Loopback Scope:** In local deployment, the synthetic monitor runs on the same server instance. It accurately detects application hangs, memory crashes, and event-loop stalls, but cannot detect edge ISP or upstream DNS routing outages between external end-users and the host.
3. **External Monitoring Recommendation:** For high-assurance production deployments, local synthetic monitoring should be complemented with an external third-party uptime service (e.g., UptimeRobot, BetterUptime, or AWS Route 53 Health Checks) probing from multiple geographic regions.
