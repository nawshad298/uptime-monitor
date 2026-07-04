require('./setup');
const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

async function getAuthToken(email = 'svc@example.com') {
  await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

describe('POST /api/services', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/services').send({ name: 'x', url: 'https://x.com' });
    expect(res.status).toBe(401);
  });

  test('creates a service for the authenticated user', async () => {
    const token = await getAuthToken();
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My API', url: 'https://example.com', check_interval_seconds: 30 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My API');
    expect(res.body.check_interval_seconds).toBe(30);
  });

  test('rejects an invalid url', async () => {
    const token = await getAuthToken();
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', url: 'not-a-url' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/services', () => {
  test('only returns services owned by the requesting user', async () => {
    const tokenA = await getAuthToken('a@example.com');
    const tokenB = await getAuthToken('b@example.com');

    await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'A service', url: 'https://a.com' });

    const res = await request(app)
      .get('/api/services')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
