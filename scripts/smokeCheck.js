#!/usr/bin/env node
// smokeCheck.js - simple smoke tests for backend
// Usage: node scripts/smokeCheck.js

import axios from 'axios';

const API = 'http://localhost:5000';

async function run() {
  console.log('Running backend smoke checks...');

  try {
    const h = await axios.get(`${API}/health`, { timeout: 3000 });
    console.log('Health:', h.status, h.data?.status || 'ok');
  } catch (e) {
    console.error('Health check failed:', e.message || e);
  }

  try {
    const q = await axios.get(`${API}/api/queue/status`, { timeout: 3000 });
    console.log('Queue status:', q.status, q.data?.queue ? `players=${q.data.queue.players?.length}` : 'no queue');
  } catch (e) {
    console.error('Queue status check failed:', e.message || e);
  }

  try {
    const m = await axios.get(`${API}/api/match/current`, { timeout: 3000 });
    console.log('Current match:', m.status, m.data?.match ? m.data.match.matchId : 'none');
  } catch (e) {
    if (e.response?.status === 404) console.log('Current match: none (404)');
    else console.error('Current match check failed:', e.message || e);
  }

  console.log('Smoke checks complete');
}

run().catch((err) => {
  console.error('Smoke check failure:', err);
  process.exit(1);
});
