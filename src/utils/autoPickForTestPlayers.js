// ====================================================================
// autoPickForTestPlayers.js
// ====================================================================
// Description: Automatically pick players for simulated test captains
// Usage: Called automatically when draft phase starts with test captains
// ====================================================================

import Match from '../models/match.model.js';
import { emitDraftUpdate, emitPhaseChange, emitVetoUpdate } from './socketEvents.js';

/**
 * Automatically pick players for simulated captains (SimPlayer1-9)
 * @param {Object} io - Socket.IO instance
 * @param {String} matchId - Match ID
 */
export const autoPickForTestPlayers = async (io, matchId) => {
  try {
    const match = await Match.findOne({ matchId });
    
    if (!match || match.phase !== 'draft') {
      return;
    }

    console.log(`🤖 Starting auto-pick for test captains in match ${matchId}`);

    // Keep checking and auto-picking until draft is complete
    const autoPickInterval = setInterval(async () => {
      try {
        // Refresh match data
        const currentMatch = await Match.findOne({ matchId });
        
        if (!currentMatch) {
          console.log(`⚠️ Match not found: ${matchId}`);
          clearInterval(autoPickInterval);
          return;
        }

        if (currentMatch.phase !== 'draft') {
          console.log(`✅ Auto-pick complete for match ${matchId} - Phase: ${currentMatch.phase}`);
          clearInterval(autoPickInterval);
          
          // If phase changed to veto, start auto-ban
          if (currentMatch.phase === 'veto') {
            const { autoBanForTestPlayers } = await import('./autoBanForTestPlayers.js');
            autoBanForTestPlayers(io, matchId);
          }
          return;
        }

        // Get current picker
        const currentTeam = currentMatch.currentPicker;
        const currentCaptain = currentMatch.captains[currentTeam];

        if (currentCaptain && currentCaptain.startsWith('SIM_PLAYER_')) {
          // This is a simulated captain, auto-pick a random available player
          const availablePlayers = currentMatch.players.filter((p) => {
            const isPicked = 
              currentMatch.teams.alpha.includes(p.steamId) ||
              currentMatch.teams.beta.includes(p.steamId);
            const isCaptain = p.steamId === currentMatch.captains.alpha || p.steamId === currentMatch.captains.beta;
            return !isPicked && !isCaptain;
          });

          console.log(`📊 Available players: ${availablePlayers.length}, Pick index: ${currentMatch.pickIndex}/${currentMatch.pickOrder.length}`);

          if (availablePlayers.length > 0) {
            const randomPlayer = availablePlayers[
              Math.floor(Math.random() * availablePlayers.length)
            ];

            console.log(`🤖 Auto-picking ${randomPlayer.name} for ${currentCaptain} (${currentTeam}) - Pick ${currentMatch.pickIndex + 1}/${currentMatch.pickOrder.length}`);

            // Pick the player
            await currentMatch.pickPlayer(randomPlayer.steamId, currentTeam);

            // Reload match to check phase
            const updatedMatch = await Match.findOne({ matchId });
            
            console.log(`📝 After pick - Phase: ${updatedMatch.phase}, Pick Index: ${updatedMatch.pickIndex}/${updatedMatch.pickOrder.length}`);
            
            // Emit Socket.IO update
            if (io) {
              if (updatedMatch.phase === 'veto') {
                // Draft just completed
                console.log(`✅ Draft complete! Moving to veto phase`);
                console.log(`🔍 Veto data - Index: ${updatedMatch.vetoIndex}, Order length: ${updatedMatch.vetoOrder?.length}, Current: ${updatedMatch.currentVeto}`);
                emitDraftUpdate(io, updatedMatch);
                emitPhaseChange(io, updatedMatch, 'veto');
                clearInterval(autoPickInterval);
                
                // Start auto-ban after a short delay to ensure frontend receives phase change
                setTimeout(async () => {
                  const { autoBanForTestPlayers } = await import('./autoBanForTestPlayers.js');
                  autoBanForTestPlayers(io, matchId);
                }, 500);
              } else {
                emitDraftUpdate(io, updatedMatch);
              }
            }
          } else {
            // No players left to pick - draft should be complete
            console.log(`✅ No available players left - draft complete`);
            clearInterval(autoPickInterval);
          }
        } else {
          console.log(`⏳ Waiting for real player ${currentCaptain} to pick...`);
        }
        // If current picker is a real player, wait for them to pick
      } catch (error) {
        console.error('Auto-pick error:', error);
        console.error('Error stack:', error.stack);
        // Don't clear interval on error, keep trying
      }
    }, 1500); // Check every 1.5 seconds (faster)

  } catch (error) {
    console.error('Failed to start auto-pick:', error);
  }
};

export default autoPickForTestPlayers;
