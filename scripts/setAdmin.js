/**
 * Set Admin Script
 * 
 * Makes a user an admin by Steam ID or username
 * 
 * Usage:
 *   node scripts/setAdmin.js <steamId_or_username>
 *   npm run set-admin <steamId_or_username>
 */

import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import User from '../src/models/user.model.js';

async function setAdmin(identifier) {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB');

    // Find user by Steam ID or name
    const user = await User.findOne({
      $or: [
        { steamId: identifier },
        { name: { $regex: new RegExp(`^${identifier}$`, 'i') } }
      ]
    });

    if (!user) {
      console.error(`❌ User not found: ${identifier}`);
      console.log('\nTip: Make sure the user has logged in at least once');
      process.exit(1);
    }

    // Check if already admin
    if (user.isAdmin) {
      console.log(`ℹ️  User ${user.name} (${user.steamId}) is already an admin`);
      process.exit(0);
    }

    // Set admin flag
    user.isAdmin = true;
    await user.save();

    console.log('\n✅ Admin privileges granted!');
    console.log('═══════════════════════════════════════');
    console.log(`   Name: ${user.name}`);
    console.log(`   Steam ID: ${user.steamId}`);
    console.log(`   Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error setting admin:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Get identifier from command line
const identifier = process.argv[2];

if (!identifier) {
  console.error('❌ Please provide a Steam ID or username');
  console.log('\nUsage:');
  console.log('  node scripts/setAdmin.js <steamId_or_username>');
  console.log('  npm run set-admin <steamId_or_username>');
  console.log('\nExample:');
  console.log('  node scripts/setAdmin.js Irish');
  console.log('  node scripts/setAdmin.js 76561198012345678');
  process.exit(1);
}

// Run
setAdmin(identifier);
