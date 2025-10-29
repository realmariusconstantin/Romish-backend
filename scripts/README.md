# 🧪 Romish.gg Testing Scripts

This directory contains automated testing scripts to simulate player activity and populate your local development environment.

## 📋 Prerequisites

Make sure your backend server is running:
```bash
npm run dev
```

The server should be available at:
- **HTTP API**: `http://localhost:5000`
- **WebSocket**: `http://localhost:5000` (Socket.IO)

## 🚀 Scripts Overview

### 1️⃣ `seedUsers.js` - Database Seeding
**Purpose**: Populates MongoDB with 50 realistic test users

**Features**:
- Creates users with CS2-style ranks (Silver I → Global Elite)
- Generates random MMR ratings (500-3000)
- Includes match history (wins/losses)
- First user is set as admin
- Uses placeholder avatars from picsum.photos

**Usage**:
```bash
node scripts/seedUsers.js
```

**Output**:
- 50 test users in database
- Usernames: `TestPlayer1` to `TestPlayer50`
- Steam IDs: `TEST_PLAYER_1` to `TEST_PLAYER_50`

---

### 2️⃣ `simulateJoinQueue.js` - HTTP Queue Testing
**Purpose**: Simulates 9 players joining the queue via REST API

**Features**:
- Creates authenticated test users in MongoDB
- Generates JWT tokens for each user
- Makes sequential HTTP POST requests to `/api/queue/join`
- Adds realistic delays between joins (300ms)
- Handles duplicate join attempts
- Bypasses Discord verification for testing
- Displays live join status
- Shows final queue status with player count

**Usage**:
```bash
node scripts/simulateJoinQueue.js
```

**What it tests**:
- Authentication flow with JWT tokens
- Queue join endpoint with authenticated requests
- Duplicate player detection
- Queue capacity (10 players)
- Match creation trigger (when you join as 10th player)
- Error handling

**Expected behavior**:
- Creates 9 authenticated test users (SimPlayer1-9)
- All 9 players join successfully
- Queue shows 9/10 players
- You can join manually as the 10th player to trigger match creation

---

### 3️⃣ `simulateWSClients.js` - WebSocket Testing
**Purpose**: Simulates 12 WebSocket clients connecting and joining queue

**Features**:
- Creates Socket.IO client connections
- Sends identify payloads
- Emits joinQueue events with random delays
- Logs all incoming Socket.IO events in real-time
- Keeps connections alive for 30 seconds
- Graceful shutdown on Ctrl+C

**Usage**:
```bash
node scripts/simulateWSClients.js
```

**What it tests**:
- WebSocket connection handling
- Socket.IO event emissions
- Real-time queue updates
- Match creation broadcasts
- Draft/veto phase events
- Multi-client synchronization

**Events monitored**:
- `queue:updated` - Queue state changes
- `queue:player-joined` - New player joins
- `queue:player-left` - Player leaves
- `queue:full` - Match creation triggered
- `match:created` - New match started
- `match:draft-update` - Captain picks player
- `match:veto-update` - Map banned
- `match:phase-change` - Phase transitions

---

## 🎯 Testing Workflow

### Full System Test
Run these scripts in order to test the complete matchmaking flow:

```bash
# Step 1: Seed database with test users
node scripts/seedUsers.js

# Step 2: Start your backend server (in another terminal)
npm run dev

# Step 3: Test HTTP queue system
node scripts/simulateJoinQueue.js

# Step 4: Test WebSocket real-time updates
node scripts/simulateWSClients.js
```

### Quick Queue Test
Test queue capacity and match creation:
```bash
node scripts/simulateJoinQueue.js
```

### Real-time Events Test
Monitor WebSocket events:
```bash
node scripts/simulateWSClients.js
```

---

## 🔍 What to Look For

### In Terminal (Scripts)
- ✅ Green checkmarks for successful operations
- ⚠️ Yellow warnings for expected issues (duplicate joins)
- ❌ Red errors for failures
- 📥 Incoming Socket.IO events
- 📤 Outgoing Socket.IO events

### In Server Logs
- Queue updates (player count changes)
- Match creation messages
- Draft phase initialization
- Veto phase initialization
- Socket.IO connection/disconnection logs

### In Database (MongoDB Compass/Atlas)
- `users` collection populated with test users
- `queues` collection showing active queue
- `matches` collection with created matches
- Player assignments to teams

---

## 🛠️ Troubleshooting

### "Server is not reachable"
**Problem**: Backend server not running
**Solution**: Start server with `npm run dev`

### "Connection timeout"
**Problem**: WebSocket server not accepting connections
**Solution**: Check if Socket.IO is properly configured in `server.js`

### "Already in queue" errors
**Problem**: Test players from previous run still in queue
**Solution**: 
- Restart backend server
- Or clear queue collection: `db.queues.deleteMany({})`

### "MongoDB connection failed"
**Problem**: Invalid MONGO_URI or database offline
**Solution**: 
- Check `.env` file has correct `MONGODB_URI`
- Verify MongoDB Atlas/local instance is running
- Test connection manually

### Script hangs/freezes
**Problem**: Waiting for events that never arrive
**Solution**:
- Press Ctrl+C to exit
- Check server logs for errors
- Verify Socket.IO events are being emitted

---

## 📊 Expected Results

### After `seedUsers.js`:
```
✅ Successfully seeded database!
📊 Total users created: 50
📋 Sample Users:
1. TestPlayer1 (Admin)
   Rank: Global Elite (2850 MMR)
   Stats: 42W / 28L (70 matches)
```

### After `simulateJoinQueue.js`:
```
✅ Successful joins: 20
⚠️ Already in queue: 0
❌ Failed joins: 0
📊 Total players in queue: 10
🎉 Queue is FULL! Match creation triggered.
```

### After `simulateWSClients.js`:
```
✅ 12/12 clients connected successfully
📥 Client 1 recv [queue:player-joined]: WSSim1 joined
📥 Client 2 recv [queue:full]: Match MATCH-abc123 created!
📥 Client 3 recv [match:phase-change]: Phase changed to draft
```

---

## 🧹 Cleanup

### Clear test data:
```bash
# MongoDB Shell or Compass
db.users.deleteMany({ steamId: /^TEST_PLAYER_\d+$/ })
db.users.deleteMany({ steamId: /^SIM_PLAYER_\d+$/ })
db.users.deleteMany({ steamId: /^WS_SIM_\d+$/ })
db.queues.deleteMany({})
db.matches.deleteMany({ matchId: /^TEST-/ })
```

### Or restart your backend server
The queue is typically cleared when the server restarts (depending on your implementation).

---

## 📝 Notes

- All scripts use ESM modules (`import` syntax)
- Scripts are idempotent (safe to run multiple times)
- Random delays simulate realistic user behavior
- Avatar URLs use picsum.photos (requires internet)
- Socket.IO clients auto-reconnect on connection loss

---

## 🎮 Happy Testing!

These scripts will help you:
- Test queue logic without manual user actions
- Verify WebSocket real-time updates
- Stress test match creation
- Debug draft/veto phase issues
- Simulate concurrent player activity

For questions or issues, check your server logs first! 🚀
