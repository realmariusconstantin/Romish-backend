#!/usr/bin/env node
// deleteAllSimPlayers.js
// Interactive script to permanently delete all simulated users whose steamId starts with 'SIM_PLAYER_'.
// Usage:
//  - Preview only: node scripts/deleteAllSimPlayers.js
//  - Confirm via prompt: node scripts/deleteAllSimPlayers.js and type DELETE when prompted
//  - Auto-confirm (non-interactive): node scripts/deleteAllSimPlayers.js --yes

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import User from '../src/models/user.model.js';
import Match from '../src/models/match.model.js';
import Queue from '../src/models/queue.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';
const AUTO_YES = process.argv.includes('--yes') || process.env.CONFIRM_REMOVE_SIM_PLAYERS === '1';

async function promptConfirm() {
  if (AUTO_YES) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question("Type DELETE to permanently remove all SIM_PLAYER_ users (case-sensitive): ", (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });

  return answer === 'DELETE';
}

async function run() {
  console.log('\n=== deleteAllSimPlayers.js ===');
  console.log('This script will permanently delete all users with steamId starting with SIM_PLAYER_ and remove references from matches and queue.');

  try {
    await mongoose.connect(MONGO_URI, { dbName: undefined });
    console.log('Connected to MongoDB');

    const simFilter = { steamId: { $regex: '^SIM_PLAYER_' } };
    const usersCount = await User.countDocuments(simFilter);
    const matchesCount = await Match.countDocuments({ 'players.steamId': { $regex: '^SIM_PLAYER_' } });
    const queueCount = await Queue.countDocuments({ 'players.steamId': { $regex: '^SIM_PLAYER_' } });

    console.log('\nPreview:');
    console.log(`  SIM users found: ${usersCount}`);
    console.log(`  Matches containing SIM players: ${matchesCount}`);
    console.log(`  Queue documents containing SIM players: ${queueCount}`);

    if (usersCount === 0 && matchesCount === 0 && queueCount === 0) {
      console.log('\nNo simulated players detected. Nothing to do.');
      await mongoose.disconnect();
      process.exit(0);
    }

    const confirmed = await promptConfirm();
    if (!confirmed) {
      console.log('\nAborted by user. No changes made.');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('\nConfirmed. Deleting SIM users...');

    // Delete user documents
    const delRes = await User.deleteMany(simFilter);
    console.log(`Deleted users: ${delRes.deletedCount || 0}`);

    // Remove player objects from matches.players
    const matchPlayersPull = await Match.updateMany(
      { 'players.steamId': { $regex: '^SIM_PLAYER_' } },
      { $pull: { players: { steamId: { $regex: '^SIM_PLAYER_' } } } }
    );
    console.log(`Matches modified (players pulled): ${matchPlayersPull.modifiedCount || matchPlayersPull.nModified || 0}`);

    // Remove sim steamIds from teams arrays
    const matchTeamsPull = await Match.updateMany(
      { $or: [{ 'teams.alpha': { $elemMatch: { $regex: '^SIM_PLAYER_' } } }, { 'teams.beta': { $elemMatch: { $regex: '^SIM_PLAYER_' } } }] },
      { $pull: { 'teams.alpha': { $regex: '^SIM_PLAYER_' }, 'teams.beta': { $regex: '^SIM_PLAYER_' } } }
    );
    console.log(`Matches modified (teams cleaned): ${matchTeamsPull.modifiedCount || matchTeamsPull.nModified || 0}`);

    // Remove from queue documents
    const queuePull = await Queue.updateMany(
      {},
      { $pull: { players: { steamId: { $regex: '^SIM_PLAYER_' } } } }
    );
    console.log(`Queue documents modified (players pulled): ${queuePull.modifiedCount || queuePull.nModified || 0}`);

    console.log('\nDone.');
    console.log('Recommendation: Inspect matches and queue in the admin panel and restart backend if needed.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
