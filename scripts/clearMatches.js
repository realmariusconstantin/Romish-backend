import mongoose from 'mongoose';
import Match from '../src/models/match.model.js';
import User from '../src/models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

const clearMatches = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    console.log('🔍 Deleting all incomplete matches...');
    const result = await Match.deleteMany({
      phase: { $in: ['draft', 'veto', 'ready'] }
    });
    
    console.log(`✅ Deleted ${result.deletedCount} incomplete matches\n`);

    console.log('🔍 Clearing currentMatch from all users...');
    const userResult = await User.updateMany(
      { currentMatch: { $ne: null } },
      { $set: { currentMatch: null, inQueue: false } }
    );

    console.log(`✅ Cleared currentMatch from ${userResult.modifiedCount} users\n`);
    
    console.log('✅ Cleanup completed successfully!\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
  }
};

clearMatches();
