/**
 * Service Availability Monitor
 * Requirement: OIPP-NF-002 / GitHub Issue #22
 *
 * Implements synthetic health-check monitoring and monthly availability calculation.
 *
 * Features:
 *  - Distinguishes successful (HTTP 200, status: UP) from failed checks (timeout, 5xx, connection refused).
 *  - Records timestamps, response times, HTTP statuses, and error details for each probe.
 *  - Computes availability percentage: (successfulChecks / totalChecks) * 100.
 *  - Tracks cumulative uptime and downtime in seconds based on check interval and incident durations.
 *  - Detects and tracks discrete downtime incidents (start, end, duration, root cause).
 *  - Evaluates whether service satisfies the SRS 99.0% monthly availability requirement.
 *  - Gracefully handles monitor errors and network timeouts without throwing.
 */

'use strict';

const http = require('http');
const https = require('https');

/** Target monthly availability SLA percentage from SRS */
const SLA_TARGET_PERCENT = 99.0;

/** Default probe timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/** Default periodic check interval in milliseconds (1 minute) */
const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;

/** Maximum in-memory check history length to prevent memory leakage */
const MAX_HISTORY_LENGTH = 1000;

class AvailabilityMonitor {
  constructor(options = {}) {
    this.slaTarget = options.slaTarget || SLA_TARGET_PERCENT;
    this.checkIntervalMs = options.checkIntervalMs || DEFAULT_CHECK_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    this.checks = []; // Array of { timestamp, status, responseTimeMs, statusCode, error }
    this.incidents = []; // Array of { start, end, durationSeconds, reason }
    this.currentIncident = null;
    this.timer = null;
  }

  /**
   * Resets all recorded checks and incidents.
   */
  reset() {
    this.stop();
    this.checks = [];
    this.incidents = [];
    this.currentIncident = null;
  }

  /**
   * Manually records a check result.
   * Useful for deterministic testing and simulated outages.
   *
   * @param {object} result
   * @param {'UP'|'DOWN'} result.status
   * @param {number} [result.responseTimeMs=0]
   * @param {number} [result.statusCode=200]
   * @param {string|null} [result.error=null]
   * @param {number} [result.timestamp=Date.now()]
   * @param {number} [result.intervalSeconds] - Estimated duration represented by this check
   */
  recordCheck({
    status,
    responseTimeMs = 0,
    statusCode = status === 'UP' ? 200 : 503,
    error = null,
    timestamp = Date.now(),
    intervalSeconds = Math.round(this.checkIntervalMs / 1000),
  }) {
    const isUp = status === 'UP';
    const entry = {
      timestamp,
      status: isUp ? 'UP' : 'DOWN',
      responseTimeMs: Math.max(0, responseTimeMs),
      statusCode,
      error: error || (isUp ? null : 'Service unavailable'),
      intervalSeconds,
    };

    this.checks.push(entry);
    if (this.checks.length > MAX_HISTORY_LENGTH) {
      this.checks.shift();
    }

    // Incident tracking
    if (!isUp) {
      if (!this.currentIncident) {
        this.currentIncident = {
          start: timestamp,
          reason: entry.error,
          checksCount: 1,
        };
      } else {
        this.currentIncident.checksCount++;
      }
    } else {
      if (this.currentIncident) {
        const incidentEnd = timestamp;
        const durationSeconds = Math.max(
          intervalSeconds,
          Math.round((incidentEnd - this.currentIncident.start) / 1000)
        );
        this.incidents.push({
          start: new Date(this.currentIncident.start).toISOString(),
          end: new Date(incidentEnd).toISOString(),
          durationSeconds,
          reason: this.currentIncident.reason,
          failedChecks: this.currentIncident.checksCount,
        });
        this.currentIncident = null;
      }
    }

    return entry;
  }

  /**
   * Executes a synthetic HTTP/HTTPS probe against a health check URL.
   * Does not throw; captures network or response failures safely.
   *
   * @param {string} url - Target URL (e.g. 'http://127.0.0.1:3000/api/health')
   * @returns {Promise<object>} The recorded check entry
   */
  async probe(url) {
    const startTime = performance.now();
    const timestamp = Date.now();

    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const response = await new Promise((resolve, reject) => {
        const req = transport.get(
          url,
          {
            timeout: this.timeoutMs,
            rejectUnauthorized: false, // Allow local self-signed test certs
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve({ statusCode: res.statusCode, body: data });
            });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error(`Probe timed out after ${this.timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });
      });

      const responseTimeMs = Math.round(performance.now() - startTime);
      let isUp = false;
      let error = null;

      if (response.statusCode >= 200 && response.statusCode < 300) {
        try {
          const json = JSON.parse(response.body);
          if (json && (json.status === 'UP' || json.status === 'ok' || json.ok === true)) {
            isUp = true;
          } else {
            error = `Unhealthy status in response: ${json ? json.status : 'unknown'}`;
          }
        } catch (_) {
          // If body is not JSON but status is 2xx, treat as UP
          isUp = true;
        }
      } else {
        error = `HTTP ${response.statusCode}`;
      }

      return this.recordCheck({
        status: isUp ? 'UP' : 'DOWN',
        responseTimeMs,
        statusCode: response.statusCode,
        error,
        timestamp,
      });
    } catch (err) {
      const responseTimeMs = Math.round(performance.now() - startTime);
      return this.recordCheck({
        status: 'DOWN',
        responseTimeMs,
        statusCode: 0,
        error: err.message || 'Connection failure',
        timestamp,
      });
    }
  }

  /**
   * Starts periodic background monitoring of the specified URL.
   *
   * @param {string} url - Target URL to probe
   * @param {number} [intervalMs] - Check interval in ms
   */
  start(url, intervalMs = this.checkIntervalMs) {
    this.stop();
    this.checkIntervalMs = intervalMs;

    // Run first check immediately, then on interval
    this.probe(url).catch(() => {});

    this.timer = setInterval(() => {
      this.probe(url).catch(() => {});
    }, intervalMs);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref(); // Prevent timer from keeping the process open
    }
  }

  /**
   * Stops periodic background monitoring.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Computes comprehensive availability metrics.
   *
   * @returns {object} Availability metrics report
   */
  getMetrics() {
    const totalChecks = this.checks.length;
    if (totalChecks === 0) {
      return {
        availabilityPercentage: 100.0,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        uptimeSeconds: 0,
        downtimeSeconds: 0,
        observationStart: null,
        observationEnd: null,
        observationPeriodSeconds: 0,
        slaTarget: this.slaTarget,
        meetsSla: true,
        incidents: [],
        recentChecks: [],
      };
    }

    let successfulChecks = 0;
    let failedChecks = 0;
    let downtimeSeconds = 0;
    let uptimeSeconds = 0;

    for (const check of this.checks) {
      const duration = check.intervalSeconds || Math.round(this.checkIntervalMs / 1000);
      if (check.status === 'UP') {
        successfulChecks++;
        uptimeSeconds += duration;
      } else {
        failedChecks++;
        downtimeSeconds += duration;
      }
    }

    const availabilityPercentage = Number(
      ((successfulChecks / totalChecks) * 100).toFixed(3)
    );

    const firstCheck = this.checks[0];
    const lastCheck = this.checks[this.checks.length - 1];
    const observationPeriodSeconds = Math.max(
      uptimeSeconds + downtimeSeconds,
      Math.round((lastCheck.timestamp - firstCheck.timestamp) / 1000)
    );

    const allIncidents = [...this.incidents];
    if (this.currentIncident) {
      allIncidents.push({
        start: new Date(this.currentIncident.start).toISOString(),
        end: 'IN_PROGRESS',
        durationSeconds: Math.round((Date.now() - this.currentIncident.start) / 1000),
        reason: this.currentIncident.reason,
        failedChecks: this.currentIncident.checksCount,
      });
    }

    return {
      availabilityPercentage,
      totalChecks,
      successfulChecks,
      failedChecks,
      uptimeSeconds,
      downtimeSeconds,
      observationStart: new Date(firstCheck.timestamp).toISOString(),
      observationEnd: new Date(lastCheck.timestamp).toISOString(),
      observationPeriodSeconds,
      slaTarget: this.slaTarget,
      meetsSla: availabilityPercentage >= this.slaTarget,
      incidents: allIncidents,
      recentChecks: this.checks.slice(-10),
    };
  }
}

// Global default singleton instance
const defaultMonitor = new AvailabilityMonitor();

module.exports = {
  AvailabilityMonitor,
  defaultMonitor,
  SLA_TARGET_PERCENT,
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
};
