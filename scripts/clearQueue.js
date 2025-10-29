// ====================================================================
// clearQueue.js
// ====================================================================
// Description: Clears the current queue and resets all users' inQueue status
// Usage: node scripts/clearQueue.js
// ====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Queue from '../src/models/queue.model.js';
import User from '../src/models/user.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

async function clearQueue() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║            ROMISH.GG - CLEAR QUEUE SCRIPT             ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    // Connect to MongoDB
    console.log('\n🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // Get active queue
    console.log('\n🔍 Looking for active queue...');
    const queue = await Queue.findOne({ status: { $in: ['waiting', 'processing'] } });

    if (!queue) {
      console.log('⚠️  No active queue found');
    } else {
      console.log(`✅ Found queue with ${queue.players.length} players`);
      console.log('   Players:', queue.players.map(p => p.name).join(', '));

      // Delete the queue
      await Queue.deleteOne({ _id: queue._id });
      console.log('✅ Queue deleted');
    }

    // Reset all users' inQueue status
    console.log('\n🔄 Resetting all users inQueue status...');
    const result = await User.updateMany(
      { inQueue: true },
      { $set: { inQueue: false } }
    );
    console.log(`✅ Reset ${result.modifiedCount} users`);

    console.log('\n✅ Queue cleared successfully!');
    console.log('\n💡 You can now join the queue fresh');

    // Disconnect
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');

  } catch (error) {
    console.error('\n❌ Error clearing queue:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Execute
clearQueue()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n💥 Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
