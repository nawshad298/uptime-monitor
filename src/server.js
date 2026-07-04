const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

// Migrations are run separately via `node src/migrate.js` (see
// docker-compose.yml / the deploy pipeline) - not on every boot. See
// src/migrate.js for why that matters once you run more than one replica.
const app = createApp();
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
