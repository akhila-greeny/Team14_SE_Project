/**
 * Health and Availability Routes
 * Requirement: OIPP-NF-002 / GitHub Issue #22
 *
 * Endpoints:
 *  - GET /api/health: Lightweight health-check endpoint returning system operational status.
 *  - GET /api/health/availability: Aggregated availability metrics, uptime, downtime, and SLA evaluation.
 */

'use strict';

const express = require('express');
const { defaultMonitor } = require('../utils/availabilityMonitor');
const usersStore = require('../data/usersStore');
const drivesStore = require('../data/drivesStore');

const router = express.Router();

/**
 * GET /api/health
 *
 * Lightweight, non-destructive health-check endpoint.
 * Probed by synthetic monitors, load balancers, and container orchestrators.
 */
router.get('/health', (req, res) => {
  let storesHealthy = false;
  try {
    // Quick, non-destructive read to ensure data stores are responsive
    const users = typeof usersStore.listUsers === 'function' ? usersStore.listUsers() : null;
    const drives = typeof drivesStore.listDrives === 'function' ? drivesStore.listDrives() : null;
    storesHealthy = Array.isArray(users) && Array.isArray(drives);
  } catch (_) {
    storesHealthy = false;
  }

  const isHealthy = storesHealthy;
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    subsystems: {
      server: 'UP',
      stores: storesHealthy ? 'UP' : 'DEGRADED',
    },
  });
});

/**
 * GET /api/health/availability
 *
 * Returns cumulative availability metrics, uptime/downtime tracking,
 * and compliance evaluation against the 99% monthly availability requirement.
 */
router.get('/health/availability', (req, res) => {
  const metrics = defaultMonitor.getMetrics();
  return res.status(200).json(metrics);
});

module.exports = router;
