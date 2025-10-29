# Full Match Flow Test

## Purpose
This test script simulates a complete match flow from draft to veto to server provisioning, allowing you to verify that all the correct data is being sent to Dathost.

## What it does

1. **Creates 10 users**: You (as real captain) + 9 sim players
2. **Creates a match**: You are alpha captain, SimPlayer5 is beta captain
3. **Simulates draft**: Auto-picks all players into teams
4. **Simulates veto**: Auto-bans maps until 1 remains
5. **Tests server provisioning**: Calls the Dathost integration
6. **Shows all output**: Displays MatchZy configs that would be sent

## How to run

```bash
npm run test:full-flow
```

## Before running

1. Open `scripts/testFullMatchFlow.js`
2. Update these lines with YOUR Steam ID:

```javascript
const REAL_CAPTAIN_STEAMID = 'STEAM_USER_123'; // Replace with your Steam ID
const REAL_CAPTAIN_NAME = 'Irish'; // Your username
```

## What to look for in the output

### ✅ Draft Phase
- Should show 8 picks completing
- Team Alpha: 5 players (including you)
- Team Beta: 5 players (including SimPlayer5)

### ✅ Veto Phase
- Should ban 11 maps (12 → 1 remaining)
- Final map should be selected
- Phase should change to 'ready'

### ✅ Server Provisioning
- Should display `gameConfig.json` with:
  - Correct team names
  - All 10 Steam IDs mapped to player names
  - Correct map ID (workshop ID or de_* format)
  - Match ID number
  
- Should display `whitelist.cfg` with:
  - All 10 Steam IDs, one per line
  
- Should display `autoSetup.cfg` with:
  - Command to load the game config

### ✅ Server Info
- Should show mock server info:
  - IP address
  - Password
  - RCON password
  - Connect string

## When ready for real Dathost

Once you verify the configs are correct, edit `src/utils/serverProvisioning.js` and replace the mock implementation with real Dathost API calls.

Look for these TODO comments:
```javascript
// TODO: Implement actual Dathost API call
// TODO: Implement actual file uploads
// TODO: Implement RCON commands
```

## Clean up after test

The test creates a match in your database. To clean up:

```bash
node scripts/clearMatches.js
```
