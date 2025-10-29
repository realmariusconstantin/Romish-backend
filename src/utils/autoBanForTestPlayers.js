// ====================================================================
// autoBanForTestPlayers.js
// ====================================================================
// Description: Automatically ban maps for simulated test players
// Usage: Called automatically when veto phase starts with test players
// ====================================================================

import Match from '../models/match.model.js';
import { emitVetoUpdate, emitPhaseChange, emitServerReady } from './socketEvents.js';
import { provisionServer } from './serverProvisioning.js';

/**
 * Automatically ban maps for simulated players (SimPlayer1-9)
 * @param {Object} io - Socket.IO instance
 * @param {String} matchId - Match ID
 */
export const autoBanForTestPlayers = async (io, matchId) => {
  try {
    const match = await Match.findOne({ matchId });
    
    if (!match || match.phase !== 'veto') {
      return;
    }

    console.log(`🤖 Starting auto-ban for test players in match ${matchId}`);

    // Keep checking and auto-banning until veto is complete
    const autoBanInterval = setInterval(async () => {
      try {
        // Refresh match data
        const currentMatch = await Match.findOne({ matchId });
        
        if (!currentMatch) {
          console.log(`⚠️ Match not found: ${matchId}`);
          clearInterval(autoBanInterval);
          return;
        }

        if (currentMatch.phase !== 'veto') {
          console.log(`✅ Auto-ban complete for match ${matchId} - Phase: ${currentMatch.phase}`);
          clearInterval(autoBanInterval);
          return;
        }

        // Check if current banner is a test player
        const currentTeam = currentMatch.currentVeto; // Use the currentVeto field directly
        const currentCaptain = currentMatch.captains[currentTeam];

        console.log(`📊 Available maps: ${currentMatch.availableMaps.length}, Current turn: ${currentTeam}, Phase: ${currentMatch.phase}`);

        if (currentCaptain && currentCaptain.startsWith('SIM_PLAYER_')) {
          // This is a simulated player, auto-ban a random available map
          // SIMPLE RULE: Ban if there are 2 or more maps (leave exactly 1)
          if (currentMatch.availableMaps.length >= 2) {
            const randomMap = currentMatch.availableMaps[
              Math.floor(Math.random() * currentMatch.availableMaps.length)
            ];

            console.log(`🤖 Auto-banning ${randomMap} for ${currentCaptain} (${currentTeam}) - Maps remaining: ${currentMatch.availableMaps.length}`);

            // Ban the map
            await currentMatch.banMap(randomMap, currentTeam);

            // Reload match to check phase
            const updatedMatch = await Match.findOne({ matchId });

            console.log(`✅ Ban complete - Maps remaining AFTER ban: ${updatedMatch.availableMaps.length}, Phase: ${updatedMatch.phase}, Selected map: ${updatedMatch.selectedMap || 'none'}`);

            // Emit Socket.IO update
            if (io) {
              emitVetoUpdate(io, updatedMatch);
              
              // If veto is complete (phase changed to 'ready' or only 1 map left)
              if (updatedMatch.phase === 'ready' || updatedMatch.availableMaps.length === 1) {
                console.log(`✅ Veto complete for match ${matchId} - Selected map: ${updatedMatch.selectedMap}`);
                emitPhaseChange(io, updatedMatch, 'ready');
                
                // Start server provisioning
                console.log(`🚀 Starting server provisioning...`);
                const matchIdNumber = parseInt(matchId.split('-')[1]) || 1;
                const provisionResult = await provisionServer(updatedMatch, matchIdNumber);
                
                if (provisionResult.success) {
                  // Update match with server info
                  updatedMatch.serverInfo = provisionResult.serverInfo;
                  updatedMatch.phase = 'live'; // Move to live phase
                  await updatedMatch.save();
                  
                  console.log(`✅ Server ready! Connect string: ${provisionResult.serverInfo.connectString}`);
                  emitServerReady(io, updatedMatch);
                } else {
                  console.error(`❌ Server provisioning failed: ${provisionResult.error}`);
                }
                
                clearInterval(autoBanInterval);
              }
            }
          } else {
            // Only 1 map left - veto complete
            console.log(`✅ Veto complete - final map selected: ${currentMatch.selectedMap}`);
            clearInterval(autoBanInterval);
          }
        } else {
          console.log(`⏳ Waiting for real player ${currentCaptain} to ban...`);
        }
        // If current captain is a real player, wait for them to ban
      } catch (error) {
        console.error('Auto-ban error:', error);
        console.error('Error stack:', error.stack);
        // Don't clear interval on error, keep trying
      }
    }, 1500); // Check every 1.5 seconds (faster)

  } catch (error) {
    console.error('Failed to start auto-ban:', error);
  }
};

export default autoBanForTestPlayers;
