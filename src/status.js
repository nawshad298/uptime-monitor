const express = require('express');
const { pool } = require('./db');

const router = express.Router();

// Public status page for a single service - no auth, because the whole
// point of a status page is that anyone (including anxious customers)
// can check it without an account.
router.get('/:serviceId', async (req, res) => {
  const serviceResult = await pool.query(
    'SELECT id, name, url FROM services WHERE id = $1',
    [req.params.serviceId]
  );
  if (serviceResult.rows.length === 0) {
    return res.status(404).json({ error: 'Service not found' });
  }
  const service = serviceResult.rows[0];

  // Uptime % = (up checks / total checks) over each window.
  // Doing this as one query with FILTER is much cheaper than three
  // round trips, and is the kind of query worth explaining in an interview.
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE checked_at > now() - interval '24 hours') AS total_24h,
       COUNT(*) FILTER (WHERE checked_at > now() - interval '24 hours' AND status = 'up') AS up_24h,
       COUNT(*) FILTER (WHERE checked_at > now() - interval '7 days') AS total_7d,
       COUNT(*) FILTER (WHERE checked_at > now() - interval '7 days' AND status = 'up') AS up_7d,
       COUNT(*) FILTER (WHERE checked_at > now() - interval '30 days') AS total_30d,
       COUNT(*) FILTER (WHERE checked_at > now() - interval '30 days' AND status = 'up') AS up_30d
     FROM checks WHERE service_id = $1`,
    [service.id]
  );
  const r = rows[0];

  const pct = (up, total) => (total > 0 ? Number(((up / total) * 100).toFixed(2)) : null);

  const latest = await pool.query(
    `SELECT status, checked_at FROM checks WHERE service_id = $1
     ORDER BY checked_at DESC LIMIT 1`,
    [service.id]
  );

  const openIncident = await pool.query(
    `SELECT id, started_at FROM incidents
     WHERE service_id = $1 AND status = 'open'
     ORDER BY started_at DESC LIMIT 1`,
    [service.id]
  );

  res.json({
    service: { id: service.id, name: service.name },
    current_status: latest.rows[0]?.status || 'unknown',
    last_checked_at: latest.rows[0]?.checked_at || null,
    open_incident: openIncident.rows[0] || null,
    uptime_percentage: {
      '24h': pct(Number(r.up_24h), Number(r.total_24h)),
      '7d': pct(Number(r.up_7d), Number(r.total_7d)),
      '30d': pct(Number(r.up_30d), Number(r.total_30d)),
    },
  });
});

module.exports = router;
