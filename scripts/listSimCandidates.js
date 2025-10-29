#!/usr/bin/env node
// listSimCandidates.js
// Non-destructive preview script to find remaining simulated users by a set of candidate regexes.
// Usage: node scripts/listSimCandidates.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';

dotenv.config();
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

const patterns = [
  '^SIM_PLAYER_',
  '^SIM_PLAYER',
  '^SIM_',
  '^SIM-',
  '^SIM',
  '^test-',
  '^TEST-',
  'SIM_PLAYER',
  'SIM',
];

async function sampleDocs(filter, limit = 20) {
  return await User.find(filter).limit(limit).select('steamId name createdAt').lean();
}

async function run() {
  console.log('\n=== listSimCandidates.js ===');
  try {
    await mongoose.connect(MONGO_URI, { dbName: undefined });
    console.log('Connected to MongoDB');

    let totalMatched = 0;
    for (const pat of patterns) {
      const regex = new RegExp(pat);
      const count = await User.countDocuments({ steamId: { $regex: regex } });
      if (count > 0) {
        totalMatched += count;
        console.log(`\nPattern: ${pat} -> ${count} matches`);
        const samples = await sampleDocs({ steamId: { $regex: regex } }, 20);
        samples.forEach(s => console.log(`  - ${s.steamId} | ${s.name || 'no-name'} | createdAt: ${s.createdAt}`));
      } else {
        console.log(`\nPattern: ${pat} -> 0 matches`);
      }
    }

    // Also list users with steamId containing SIM anywhere (case-insensitive)
    const ciRegex = /SIM/i;
    const ciCount = await User.countDocuments({ steamId: { $regex: ciRegex } });
    console.log(`\nPattern (case-insensitive contains 'SIM') -> ${ciCount} matches`);

    console.log(`\nTotal matched across patterns (may double-count): ${totalMatched}`);
    console.log('\nIf you identify the correct pattern to delete, run deleteAllSimPlayers.js with --yes or confirm interactively.');

  } catch (err) {
    console.error('Error listing candidates:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
