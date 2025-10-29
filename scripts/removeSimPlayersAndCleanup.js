#!/usr/bin/env node
// removeSimPlayersAndCleanup.js
// Safe, opt-in cleanup: deletes users with steamId starting with 'SIM_PLAYER_'
// and removes references to those users from matches and the queue.
// WARNING: Destructive. Requires CONFIRM_REMOVE_SIM_PLAYERS=1 to run.
// Usage (PowerShell):
//   $env:CONFIRM_REMOVE_SIM_PLAYERS='1'
//   node scripts/removeSimPlayersAndCleanup.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';
import Match from '../src/models/match.model.js';
import Queue from '../src/models/queue.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';
const CONFIRM = process.env.CONFIRM_REMOVE_SIM_PLAYERS === '1';

async function run() {
  console.log('removeSimPlayersAndCleanup.js - PREVIEW & CLEANUP');
  console.log('This script will permanently delete SIM_PLAYER_ users and remove their references from matches and queue.');

  try {
    await mongoose.connect(MONGO_URI, { dbName: undefined });
    console.log('Connected to MongoDB');

    // Preview counts
    const simUserFilter = { steamId: { $regex: '^SimPlayer' } };
    const usersCount = await User.countDocuments(simUserFilter);
    const matchesWithSims = await Match.countDocuments({ 'players.steamId': { $regex: '^SimPlayer' } });
    const queueEntries = await Queue.countDocuments({ 'players.steamId': { $regex: '^SimPlayer' } });

    console.log(`\nPreview:`);
    console.log(`  SIM users found: ${usersCount}`);
    console.log(`  Matches containing SIM players: ${matchesWithSims}`);
    console.log(`  Queue documents containing SIM players: ${queueEntries}`);

    if (!CONFIRM) {
      console.log('\nNot confirmed. To perform cleanup set the env var and re-run:');
      console.log("PowerShell: $env:CONFIRM_REMOVE_SIM_PLAYERS='1'; node scripts/removeSimPlayersAndCleanup.js");
      console.log("bash: CONFIRM_REMOVE_SIM_PLAYERS=1 node scripts/removeSimPlayersAndCleanup.js\n");
      process.exit(0);
    }

    console.log('\nConfirmed. Proceeding with cleanup...');

    // Delete users
    const deleteResult = await User.deleteMany(simUserFilter);
    console.log(`Deleted ${deleteResult.deletedCount || 0} users.`);

    // Remove player objects from matches.players (objects with steamId)
    const matchPlayersPull = await Match.updateMany(
      { 'players.steamId': { $regex: '^SIM_PLAYER_' } },
      { $pull: { players: { steamId: { $regex: '^SIM_PLAYER_' } } } }
    );
    console.log(`Matches updated (players pulled): ${matchPlayersPull.modifiedCount || matchPlayersPull.nModified || 0}`);

    // Remove sim steamIds from teams.alpha and teams.beta arrays (string arrays)
    const matchTeamsPull = await Match.updateMany(
      { $or: [{ 'teams.alpha': { $elemMatch: { $regex: '^Sim' } } }, { 'teams.beta': { $elemMatch: { $regex: '^Sim' } } }] },
      { $pull: { 'teams.alpha': { $regex: '^Sim' }, 'teams.beta': { $regex: '^Sim' } } }
    );
    console.log(`Matches updated (teams arrays cleaned): ${matchTeamsPull.modifiedCount || matchTeamsPull.nModified || 0}`);

    // Pull sim players out of queue documents
    const queuePull = await Queue.updateMany({}, { $pull: { players: { steamId: { $regex: '^Sim' } } } });
    console.log(`Queue documents updated (players pulled): ${queuePull.modifiedCount || queuePull.nModified || 0}`);

    console.log('\nCleanup complete.');
    console.log('Recommendation: Review matches for unexpected empties and restart the backend.');

  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
