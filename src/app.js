const express = require('express');
const helmet = require('helmet');
const { router: authRouter } = require('./auth');
const servicesRouter = require('./services');
const statusRouter = require('./status');
const metrics = require('./metrics');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '10kb' })); // small limit - this API never needs large bodies

  app.get('/health', (req, res) => res.status(200).send('healthy'));

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  app.use('/api/auth', authRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/status', statusRouter);

  // Centralized error handler - never leak stack traces to clients.
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
