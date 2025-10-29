import { connectDB } from './src/config/db.js';
import User from './src/models/user.model.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to steamlinks.json (CS10MAN bot is in Desktop/cs10man-bot/)
const steamLinksPath = 'C:\\Users\\mariu\\Desktop\\cs10man-bot\\CS10MAN\\data\\steamlinks.json';

async function importDiscordLinks() {
  try {
    console.log('🔗 Starting Discord link import...\n');

    // Connect to MongoDB
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Read steamlinks.json
    const steamLinksData = JSON.parse(fs.readFileSync(steamLinksPath, 'utf8'));
    console.log(`📦 Found ${steamLinksData.length} Steam ↔ Discord mappings\n`);

    let updatedCount = 0;
    let notFoundCount = 0;
    let alreadyLinkedCount = 0;

    // Process each mapping
    for (const link of steamLinksData) {
      const { steamId, discordId } = link;

      // Find user by Steam ID
      const user = await User.findOne({ steamId });

      if (user) {
        if (user.discordId === discordId) {
          console.log(`⏭️  ${steamId} already linked to Discord ${discordId}`);
          alreadyLinkedCount++;
        } else {
          // Update user with Discord ID and set as verified
          user.discordId = discordId;
          user.isDiscordVerified = true;
          await user.save();

          console.log(`✅ Updated ${user.name} (${steamId}) → Discord: ${discordId}`);
          updatedCount++;
        }
      } else {
        console.log(`❌ User not found for Steam ID: ${steamId}`);
        notFoundCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully updated: ${updatedCount}`);
    console.log(`⏭️  Already linked: ${alreadyLinkedCount}`);
    console.log(`❌ Users not found: ${notFoundCount}`);
    console.log(`📦 Total processed: ${steamLinksData.length}`);
    console.log('='.repeat(60) + '\n');

    if (notFoundCount > 0) {
      console.log('💡 Note: Users not found need to log in with Steam first to create their accounts.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing Discord links:', error);
    process.exit(1);
  }
}

// Run the import
importDiscordLinks();
