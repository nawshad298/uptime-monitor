const { pool } = require('./db');
const { checkService } = require('./checker');

const TICK_INTERVAL_MS = 5000; // how often the worker looks for due services

// Runs as a SINGLE instance (see docker-compose.yml). If you ran two
// worker replicas, both would ping every service on every tick,
// double-counting checks and potentially double-firing alerts. This
// is exactly why the worker is deliberately left out of the blue-green
// setup in Project 2 - the API can safely run two colors, the worker
// can't without adding distributed locking (a good stretch goal).
async function tick() {
  const { rows: services } = await pool.query(`
    SELECT s.* FROM services s
    LEFT JOIN LATERAL (
      SELECT checked_at FROM checks WHERE checks.service_id = s.id
      ORDER BY checked_at DESC LIMIT 1
    ) c ON true
    WHERE c.checked_at IS NULL
       OR c.checked_at < now() - (s.check_interval_seconds || ' seconds')::interval
  `);

  for (const service of services) {
    checkService(service).catch(err =>
      console.error(`Check failed for service ${service.id}:`, err.message)
    );
  }
}

async function start() {
  console.log('Worker started, polling every', TICK_INTERVAL_MS, 'ms');
  setInterval(() => {
    tick().catch(err => console.error('Worker tick failed:', err));
  }, TICK_INTERVAL_MS);
}

start();
