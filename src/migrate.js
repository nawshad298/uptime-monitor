// Run migrations as a ONE-OFF job, separate from starting the API or
// worker. This matters once you have more than one API replica (as in
// the blue-green project): if every container ran migrations on boot,
// two containers starting at once would race to apply the same
// migration. The correct pattern is: run this once, then start however
// many app replicas you want.
//
// Usage: node src/migrate.js
const { runMigrations, pool } = require('./db');

runMigrations()
  .then(() => {
    console.log('Migrations applied successfully.');
    return pool.end();
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
