#!/usr/bin/env node
// deleteSimPlayerPattern.js
// Delete users whose steamId contains 'SimPlayer' (case-insensitive by default).
// Usage:
//   Preview only: node scripts/deleteSimPlayerPattern.js
//   Confirm interactively: node scripts/deleteSimPlayerPattern.js  (then type DELETE)
//   Auto-confirm: node scripts/deleteSimPlayerPattern.js --yes
//   Or set env var: $env:CONFIRM_REMOVE_SIM_PLAYERS='1'; node scripts/deleteSimPlayerPattern.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import User from '../src/models/user.model.js';
import Match from '../src/models/match.model.js';
import Queue from '../src/models/queue.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';
const AUTO_YES = process.argv.includes('--yes') || process.env.CONFIRM_REMOVE_SIM_PLAYERS === '1';
const PATTERN_RAW = process.argv.find(arg => arg.startsWith('--pattern=')) || 'SimPlayer';
const PATTERN = PATTERN_RAW.startsWith('--pattern=') ? PATTERN_RAW.split('=')[1] : 'SimPlayer';

async function promptConfirm() {
  if (AUTO_YES) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question(`Type DELETE to permanently remove users whose steamId contains '${PATTERN}' (case-insensitive): `, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
  return answer === 'DELETE';
}

async function run() {
  console.log('\n=== deleteSimPlayerPattern.js ===');
  console.log(`Pattern: contains '${PATTERN}' (case-insensitive)`);

  try {
    await mongoose.connect(MONGO_URI, { dbName: undefined });
    console.log('Connected to MongoDB');

    const regex = new RegExp(PATTERN, 'i');
    const simFilter = { steamId: { $regex: regex } };

    const usersCount = await User.countDocuments(simFilter);
    const matchesCount = await Match.countDocuments({ 'players.steamId': { $regex: regex } });
    const queueCount = await Queue.countDocuments({ 'players.steamId': { $regex: regex } });

    console.log('\nPreview:');
    console.log(`  Users matching: ${usersCount}`);
    console.log(`  Matches containing those users: ${matchesCount}`);
    console.log(`  Queue documents containing those users: ${queueCount}`);

    if (usersCount === 0 && matchesCount === 0 && queueCount === 0) {
      console.log('\nNo matching users found. Nothing to do.');
      await mongoose.disconnect();
      process.exit(0);
    }

    const confirmed = await promptConfirm();
    if (!confirmed) {
      console.log('\nAborted by user. No changes made.');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('\nConfirmed. Proceeding with deletion...');

    // Delete user documents
    const delRes = await User.deleteMany(simFilter);
    console.log(`Deleted users: ${delRes.deletedCount || 0}`);

    // Pull from Match.players
    const matchPlayersPull = await Match.updateMany(
      { 'players.steamId': { $regex: regex } },
      { $pull: { players: { steamId: { $regex: regex } } } }
    );
    console.log(`Matches modified (players pulled): ${matchPlayersPull.modifiedCount || matchPlayersPull.nModified || 0}`);

    // Pull from teams arrays
    const matchTeamsPull = await Match.updateMany(
      { $or: [{ 'teams.alpha': { $elemMatch: { $regex: regex } } }, { 'teams.beta': { $elemMatch: { $regex: regex } } }] },
      { $pull: { 'teams.alpha': { $regex: regex }, 'teams.beta': { $regex: regex } } }
    );
    console.log(`Matches modified (teams cleaned): ${matchTeamsPull.modifiedCount || matchTeamsPull.nModified || 0}`);

    // Pull from queues
    const queuePull = await Queue.updateMany(
      {},
      { $pull: { players: { steamId: { $regex: regex } } } }
    );
    console.log(`Queue documents modified (players pulled): ${queuePull.modifiedCount || queuePull.nModified || 0}`);

    console.log('\nDeletion complete.');
    console.log('Recommendation: Inspect matches and queue and restart backend if needed.');

  } catch (err) {
    console.error('Error during deletion:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
