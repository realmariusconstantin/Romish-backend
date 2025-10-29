// ====================================================================
// verifyUserDiscord.js
// ====================================================================
// Description: Enables Discord verification for a specific user (for testing)
// Usage: node scripts/verifyUserDiscord.js <steamId_or_name>
// ====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

async function main() {
  const userIdentifier = process.argv[2] || 'Irish';
  
  console.log('\n🔧 Discord Verification Tool');
  console.log('================================\n');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user by steamId or name
    let user = await User.findOne({
      $or: [
        { steamId: userIdentifier },
        { name: userIdentifier }
      ]
    });

    if (!user) {
      console.log(`❌ User not found: ${userIdentifier}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.name} (${user.steamId})`);
    console.log(`Current Discord verification: ${user.isDiscordVerified ? '✅ Yes' : '❌ No'}\n`);

    if (user.isDiscordVerified) {
      console.log('✅ User already has Discord verification enabled!');
    } else {
      user.isDiscordVerified = true;
      await user.save();
      console.log('✅ Discord verification enabled for user!');
    }

    console.log('\n================================');
    console.log('User can now join the queue\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

main();
