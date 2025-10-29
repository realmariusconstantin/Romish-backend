/**
 * List Users Script
 * 
 * Lists all users in the database with their admin status
 * 
 * Usage:
 *   node scripts/listUsers.js
 *   npm run list-users
 */

import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import User from '../src/models/user.model.js';

async function listUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    const users = await User.find()
      .select('name steamId isAdmin isBanned inQueue createdAt lastLogin')
      .sort({ createdAt: -1 })
      .lean();

    if (users.length === 0) {
      console.log('No users found in database');
      process.exit(0);
    }

    console.log(`Found ${users.length} user(s):\n`);
    console.log('═══════════════════════════════════════════════════════════════════════════════');

    users.forEach((user, index) => {
      const isOnline = user.lastLogin && 
        (new Date() - new Date(user.lastLogin)) < 15 * 60 * 1000;
      
      console.log(`\n${index + 1}. ${user.name}`);
      console.log(`   Steam ID: ${user.steamId}`);
      console.log(`   Admin: ${user.isAdmin ? '✅ Yes' : '❌ No'}`);
      console.log(`   Banned: ${user.isBanned ? '🚫 Yes' : '✅ No'}`);
      console.log(`   In Queue: ${user.inQueue ? '🎮 Yes' : 'No'}`);
      console.log(`   Status: ${isOnline ? '🟢 Online' : '⚫ Offline'}`);
      console.log(`   Joined: ${new Date(user.createdAt).toLocaleString()}`);
      if (user.lastLogin) {
        console.log(`   Last Login: ${new Date(user.lastLogin).toLocaleString()}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════════════════════════');
    console.log('\nTo make a user admin, run:');
    console.log('  npm run set-admin <username_or_steamId>\n');

  } catch (error) {
    console.error('❌ Error listing users:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run
listUsers();
