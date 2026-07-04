const { pool } = require('./db');
const metrics = require('./metrics');

const CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT = 3;
const CHECK_TIMEOUT_MS = 10000;

// Pings a single service, records the result, and manages incident
// lifecycle. Exported separately from the worker's polling loop so it
// can be unit-tested directly without waiting on real timers.
async function checkService(service) {
  const start = Date.now();
  let status = 'down';
  let statusCode = null;
  let errorMessage = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const response = await fetch(service.url, { signal: controller.signal });
    clearTimeout(timeout);

    statusCode = response.status;
    status = response.status >= 200 && response.status < 400 ? 'up' : 'down';
  } catch (err) {
    errorMessage = err.name === 'AbortError' ? 'Request timed out' : err.message;
  }

  const responseTimeMs = Date.now() - start;

  await pool.query(
    `INSERT INTO checks (service_id, status, status_code, response_time_ms, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [service.id, status, statusCode, responseTimeMs, errorMessage]
  );

  metrics.checksTotal.inc({ status });
  metrics.checkDuration.observe(responseTimeMs / 1000);

  await updateIncidentState(service.id, status);

  return { status, statusCode, responseTimeMs, errorMessage };
}

// Opens an incident after N consecutive failures, resolves it on the
// next success. This is intentionally simple (re-derives consecutive
// failures from recent rows) rather than keeping separate mutable
// counters, so the logic is easy to reason about and to unit test.
async function updateIncidentState(serviceId, latestStatus) {
  const openIncident = await pool.query(
    `SELECT id FROM incidents WHERE service_id = $1 AND status = 'open'`,
    [serviceId]
  );

  if (latestStatus === 'up') {
    if (openIncident.rows.length > 0) {
      await pool.query(
        `UPDATE incidents SET status = 'resolved', resolved_at = now() WHERE id = $1`,
        [openIncident.rows[0].id]
      );
      metrics.incidentsResolved.inc();
    }
    return;
  }

  // status is 'down' - only open a new incident if one isn't already open
  if (openIncident.rows.length > 0) return;

  const recent = await pool.query(
    `SELECT status FROM checks WHERE service_id = $1
     ORDER BY checked_at DESC LIMIT $2`,
    [serviceId, CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT]
  );

  const allDown =
    recent.rows.length === CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT &&
    recent.rows.every(r => r.status === 'down');

  if (allDown) {
    await pool.query(`INSERT INTO incidents (service_id) VALUES ($1)`, [serviceId]);
    metrics.incidentsOpened.inc();
  }
}

module.exports = { checkService, updateIncidentState, CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT };
