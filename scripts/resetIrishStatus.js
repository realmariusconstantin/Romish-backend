// Quick script to reset Irish's queue status
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/romish';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const user = await User.findOne({ name: 'Irish' });
  if (user) {
    user.inQueue = false;
    await user.save();
    console.log('✅ Reset Irish queue status');
  }

  await mongoose.disconnect();
}

main();
