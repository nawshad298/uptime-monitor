// All tests run against a REAL Postgres instance, not a mock.
// Locally: docker compose up -d postgres, then run tests with
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/uptime_test
// In CI: GitHub Actions spins up a `services:` postgres container (see
// .github/workflows/pipeline.yml) - this is what real integration
// testing looks like, not mocking the database away.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const { pool, runMigrations } = require('../src/db');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  // Clean slate between tests - order matters because of FK constraints
  await pool.query('TRUNCATE incidents, checks, services, users CASCADE');
});

afterAll(async () => {
  await pool.end();
});
