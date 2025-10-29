// ====================================================================
// cleanupTestData.js
// ====================================================================
// Description: Cleans up test data (users, queues, matches)
// Usage: node scripts/cleanupTestData.js
// ====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';
import Queue from '../src/models/queue.model.js';
import Match from '../src/models/match.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

async function cleanup() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected\n');

    // Clean up simulated players
    console.log('🧹 Cleaning up simulated players...');
    const simPlayers = await User.find({ steamId: /^SIM_PLAYER_/ });
    console.log(`   Found ${simPlayers.length} simulated players`);
    
    for (const player of simPlayers) {
      player.inQueue = false;
      player.currentMatch = null;
      await player.save();
    }
    console.log('✅ Simulated players cleaned\n');

    // Clean up queues
    console.log('🧹 Cleaning up queues...');
    const deleteResult = await Queue.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} queues\n`);

    // Show active matches
    console.log('📊 Active matches:');
    const matches = await Match.find({ phase: { $ne: 'complete' } }).sort({ createdAt: -1 });
    console.log(`   Found ${matches.length} active matches`);
    
    if (matches.length > 0) {
      // Delete draft matches automatically
      const draftMatches = matches.filter(m => m.phase === 'draft');
      if (draftMatches.length > 0) {
        console.log(`\n🧹 Deleting ${draftMatches.length} draft matches...`);
        for (const match of draftMatches) {
          await Match.deleteOne({ _id: match._id });
          console.log(`   ✓ Deleted ${match.matchId}`);
        }
      }
      
      const remainingMatches = matches.filter(m => m.phase !== 'draft');
      if (remainingMatches.length > 0) {
        console.log('\n   Remaining active matches:');
        remainingMatches.slice(0, 10).forEach(match => {
          console.log(`   - ${match.matchId} (Phase: ${match.phase})`);
        });
        if (remainingMatches.length > 10) {
          console.log(`   ... and ${remainingMatches.length - 10} more`);
        }
        console.log('\n⚠️  Note: Non-draft matches not deleted. Complete them or delete manually if needed.');
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('💡 You can now run: npm run test:queue');

  } catch (error) {
    console.error('❌ Cleanup error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
  }
}

cleanup();
