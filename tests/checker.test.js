require('./setup');
const { pool } = require('../src/db');
const { checkService, CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT } = require('../src/checker');

async function createTestService(url) {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ('checker@example.com', 'x') RETURNING id`
  );
  const service = await pool.query(
    `INSERT INTO services (user_id, name, url) VALUES ($1, 'test', $2) RETURNING *`,
    [user.rows[0].id, url]
  );
  return service.rows[0];
}

describe('checkService incident lifecycle', () => {
  let fetchSpy;

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  test('records an "up" check on a 200 response', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 200 });
    const service = await createTestService('https://fake-service.test');

    const result = await checkService(service);

    expect(result.status).toBe('up');
    const { rows } = await pool.query('SELECT * FROM checks WHERE service_id = $1', [service.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('up');
  });

  test('opens an incident after N consecutive failures, not before', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));
    const service = await createTestService('https://fake-down-service.test');

    // Fail N-1 times: no incident yet
    for (let i = 0; i < CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT - 1; i++) {
      await checkService(service);
    }
    let incidents = await pool.query('SELECT * FROM incidents WHERE service_id = $1', [service.id]);
    expect(incidents.rows).toHaveLength(0);

    // The Nth failure should open one
    await checkService(service);
    incidents = await pool.query('SELECT * FROM incidents WHERE service_id = $1', [service.id]);
    expect(incidents.rows).toHaveLength(1);
    expect(incidents.rows[0].status).toBe('open');
  });

  test('resolves an open incident on the next successful check', async () => {
    const service = await createTestService('https://fake-flaky-service.test');

    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));
    for (let i = 0; i < CONSECUTIVE_FAILURES_TO_OPEN_INCIDENT; i++) {
      await checkService(service);
    }

    fetchSpy.mockRestore();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 200 });
    await checkService(service);

    const incidents = await pool.query('SELECT * FROM incidents WHERE service_id = $1', [service.id]);
    expect(incidents.rows).toHaveLength(1);
    expect(incidents.rows[0].status).toBe('resolved');
    expect(incidents.rows[0].resolved_at).not.toBeNull();
  });
});
