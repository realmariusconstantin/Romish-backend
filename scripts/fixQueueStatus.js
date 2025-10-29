// ====================================================================
// fixQueueStatus.js
// ====================================================================
// Description: Fixes stuck inQueue status for users not actually in queue
// Usage: node scripts/fixQueueStatus.js
// ====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';
import Queue from '../src/models/queue.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

async function fixQueueStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get active queue
    const queue = await Queue.getActiveQueue();
    
    let playersInQueue = [];
    if (queue && queue.players) {
      playersInQueue = queue.players.map(p => p.steamId);
      console.log(`📋 Found ${playersInQueue.length} players in active queue`);
    } else {
      console.log('📋 No active queue found');
    }

    // Find all users marked as inQueue
    const usersInQueue = await User.find({ inQueue: true });
    console.log(`🔍 Found ${usersInQueue.length} users with inQueue=true`);

    // Fix users who are marked inQueue but not in the actual queue
    let fixedCount = 0;
    for (const user of usersInQueue) {
      if (!playersInQueue.includes(user.steamId)) {
        user.inQueue = false;
        await user.save();
        console.log(`✅ Fixed ${user.name} (${user.steamId})`);
        fixedCount++;
      }
    }

    console.log(`\n✨ Fixed ${fixedCount} users`);
    console.log(`✅ ${usersInQueue.length - fixedCount} users correctly in queue`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixQueueStatus();
