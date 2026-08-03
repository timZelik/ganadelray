#!/usr/bin/env node
// scripts/run-drip.js
//
// Manual drip trigger. Same code path the GitHub Actions cron hits, minus the
// hour gate. Guard rails (pause, one-per-day, auto-stop) still apply.
//
//   node scripts/run-drip.js

require('dotenv').config();

const { runDailyDrip } = require('../src/schedule/dripScheduler');

runDailyDrip({ force: true })
  .then((result) => {
    console.log(result.sent
      ? `sent ${result.ideas.length} ideas`
      : `not sent: ${result.reason}`);
    process.exit(0);
  })
  .catch((error) => { console.error(error); process.exit(1); });
