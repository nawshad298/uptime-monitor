const express = require('express');
const { pool } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Create a new service to monitor
router.post('/', async (req, res) => {
  const { name, url, check_interval_seconds } = req.body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'A valid http(s) url is required' });
  }
  const interval = Number.isInteger(check_interval_seconds) ? check_interval_seconds : 60;
  if (interval < 10) {
    return res.status(400).json({ error: 'check_interval_seconds must be >= 10' });
  }

  const { rows } = await pool.query(
    `INSERT INTO services (user_id, name, url, check_interval_seconds)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.userId, name.trim(), url, interval]
  );
  res.status(201).json(rows[0]);
});

// List the current user's services, with their latest check status
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*,
            c.status AS last_status,
            c.checked_at AS last_checked_at
     FROM services s
     LEFT JOIN LATERAL (
       SELECT status, checked_at FROM checks
       WHERE checks.service_id = s.id
       ORDER BY checked_at DESC LIMIT 1
     ) c ON true
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

// Get one service (must belong to the requesting user)
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM services WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Service not found' });
  res.json(rows[0]);
});

// Delete a service (checks/incidents cascade via FK)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM services WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Service not found' });
  res.status(204).send();
});

// Recent check history for a service (used by dashboards / debugging)
router.get('/:id/checks', async (req, res) => {
  const owns = await pool.query(
    'SELECT 1 FROM services WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (owns.rows.length === 0) return res.status(404).json({ error: 'Service not found' });

  const { rows } = await pool.query(
    `SELECT status, status_code, response_time_ms, error_message, checked_at
     FROM checks WHERE service_id = $1
     ORDER BY checked_at DESC LIMIT 200`,
    [req.params.id]
  );
  res.json(rows);
});

// Incident history for a service
router.get('/:id/incidents', async (req, res) => {
  const owns = await pool.query(
    'SELECT 1 FROM services WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (owns.rows.length === 0) return res.status(404).json({ error: 'Service not found' });

  const { rows } = await pool.query(
    `SELECT id, started_at, resolved_at, status FROM incidents
     WHERE service_id = $1 ORDER BY started_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;
