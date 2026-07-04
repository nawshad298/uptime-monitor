const client = require('prom-client');

client.collectDefaultMetrics();

const checksTotal = new client.Counter({
  name: 'uptime_checks_total',
  help: 'Total number of service checks performed',
  labelNames: ['status'],
});

const checkDuration = new client.Histogram({
  name: 'uptime_check_duration_seconds',
  help: 'Duration of service checks in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const incidentsOpened = new client.Counter({
  name: 'uptime_incidents_opened_total',
  help: 'Total number of incidents opened',
});

const incidentsResolved = new client.Counter({
  name: 'uptime_incidents_resolved_total',
  help: 'Total number of incidents resolved',
});

module.exports = {
  register: client.register,
  checksTotal,
  checkDuration,
  incidentsOpened,
  incidentsResolved,
};
