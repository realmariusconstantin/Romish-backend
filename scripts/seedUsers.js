// ====================================================================
// seedUsers.js
// ====================================================================
// Description: Seeds MongoDB with 50 test users for local development
// Usage: node scripts/seedUsers.js
// ====================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// ====================================================================
// User Model Schema
// ====================================================================
const userSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: true,
  },
  rank: {
    type: String,
    default: 'Unranked',
  },
  rating: {
    type: Number,
    default: 1000,
  },
  matchesPlayed: {
    type: Number,
    default: 0,
  },
  wins: {
    type: Number,
    default: 0,
  },
  losses: {
    type: Number,
    default: 0,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);

// ====================================================================
// Rank System (matches CS2 ranks)
// ====================================================================
const CS2_RANKS = [
  'Unranked',
  'Silver I',
  'Silver II',
  'Silver III',
  'Silver IV',
  'Silver Elite',
  'Silver Elite Master',
  'Gold Nova I',
  'Gold Nova II',
  'Gold Nova III',
  'Gold Nova Master',
  'Master Guardian I',
  'Master Guardian II',
  'Master Guardian Elite',
  'Distinguished Master Guardian',
  'Legendary Eagle',
  'Legendary Eagle Master',
  'Supreme Master First Class',
  'Global Elite',
];

// ====================================================================
// Helper: Generate Random Rating
// ====================================================================
function getRandomRating() {
  // Rating range: 500-3000
  return Math.floor(Math.random() * (3000 - 500 + 1)) + 500;
}

// ====================================================================
// Helper: Get Rank from Rating
// ====================================================================
function getRankFromRating(rating) {
  if (rating < 800) return CS2_RANKS[1]; // Silver I
  if (rating < 900) return CS2_RANKS[2]; // Silver II
  if (rating < 1000) return CS2_RANKS[3]; // Silver III
  if (rating < 1100) return CS2_RANKS[4]; // Silver IV
  if (rating < 1200) return CS2_RANKS[5]; // Silver Elite
  if (rating < 1300) return CS2_RANKS[6]; // Silver Elite Master
  if (rating < 1400) return CS2_RANKS[7]; // Gold Nova I
  if (rating < 1500) return CS2_RANKS[8]; // Gold Nova II
  if (rating < 1600) return CS2_RANKS[9]; // Gold Nova III
  if (rating < 1700) return CS2_RANKS[10]; // Gold Nova Master
  if (rating < 1800) return CS2_RANKS[11]; // Master Guardian I
  if (rating < 1900) return CS2_RANKS[12]; // Master Guardian II
  if (rating < 2000) return CS2_RANKS[13]; // Master Guardian Elite
  if (rating < 2200) return CS2_RANKS[14]; // Distinguished Master Guardian
  if (rating < 2400) return CS2_RANKS[15]; // Legendary Eagle
  if (rating < 2600) return CS2_RANKS[16]; // Legendary Eagle Master
  if (rating < 2800) return CS2_RANKS[17]; // Supreme Master First Class
  return CS2_RANKS[18]; // Global Elite
}

// ====================================================================
// Main Seeding Function
// ====================================================================
async function seedUsers() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected');

    // Clear existing test users (optional - remove if you want to keep existing data)
    console.log('🗑️  Clearing existing test users...');
    await User.deleteMany({ steamId: /^TEST_PLAYER_\d+$/ });
    console.log('✅ Existing test users cleared');

    // Generate 50 test users
    console.log('👥 Generating 50 test users...');
    const users = [];

    for (let i = 1; i <= 50; i++) {
      const rating = getRandomRating();
      const rank = getRankFromRating(rating);
      const matchesPlayed = Math.floor(Math.random() * 100);
      const wins = Math.floor(matchesPlayed * (0.3 + Math.random() * 0.4)); // 30-70% win rate

      users.push({
        steamId: `TEST_PLAYER_${i}`,
        name: `TestPlayer${i}`,
        avatar: `https://picsum.photos/seed/${i}/64`,
        rank: rank,
        rating: rating,
        matchesPlayed: matchesPlayed,
        wins: wins,
        losses: matchesPlayed - wins,
        isAdmin: i === 1, // Make first user admin for testing
      });
    }

    // Insert all users into database
    console.log('💾 Inserting users into database...');
    const result = await User.insertMany(users);
    
    console.log('\n✅ Successfully seeded database!');
    console.log(`📊 Total users created: ${result.length}`);
    console.log('\n📋 Sample Users:');
    
    // Display first 5 users as samples
    result.slice(0, 5).forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name}`);
      console.log(`   Steam ID: ${user.steamId}`);
      console.log(`   Rank: ${user.rank} (${user.rating} MMR)`);
      console.log(`   Stats: ${user.wins}W / ${user.losses}L (${user.matchesPlayed} matches)`);
      console.log(`   Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
    });

    console.log('\n... and 45 more users');
    console.log('\n🎮 Ready for testing! Use these users to simulate queue activity.');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// ====================================================================
// Execute Seeding
// ====================================================================
seedUsers();
