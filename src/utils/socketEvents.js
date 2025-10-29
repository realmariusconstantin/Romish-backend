/**
 * Socket.IO Event Emitters for Real-Time Updates
 */

/**
 * Emit queue update to all clients listening
 */
export const emitQueueUpdate = (io, queueData) => {
  io.to('queue').emit('queue:updated', {
    players: queueData.players,
    count: queueData.players.length,
    required: queueData.requiredPlayers,
    status: queueData.status,
  });
};

/**
 * Emit match update to all participants
 */
export const emitMatchUpdate = (io, matchId, updateData) => {
  io.to(`match-${matchId}`).emit('match-update', updateData);
};

/**
 * Emit draft phase update (player picked)
 */
export const emitDraftUpdate = (io, match) => {
  io.to(`match-${match.matchId}`).emit('draft-update', {
    matchId: match.matchId,
    phase: match.phase,
    teams: match.teams,
    currentPicker: match.currentPicker,
    pickIndex: match.pickIndex,
    pickHistory: match.pickHistory,
  });
};

/**
 * Emit veto phase update (map banned)
 */
export const emitVetoUpdate = (io, match) => {
  io.to(`match-${match.matchId}`).emit('veto-update', {
    matchId: match.matchId,
    phase: match.phase,
    availableMaps: match.availableMaps,
    bannedMaps: match.bannedMaps,
    currentVeto: match.currentVeto,
    vetoIndex: match.vetoIndex,
    vetoOrder: match.vetoOrder,
    selectedMap: match.selectedMap,
  });
};

/**
 * Emit match phase transition
 */
export const emitPhaseChange = (io, match, newPhase) => {
  const payload = {
    matchId: match.matchId,
    phase: newPhase,
    previousPhase: match.phase,
  };
  
  // Include veto data when transitioning to veto phase
  if (newPhase === 'veto') {
    payload.vetoOrder = match.vetoOrder;
    payload.currentVeto = match.currentVeto;
    payload.vetoIndex = match.vetoIndex;
    payload.availableMaps = match.availableMaps;
  }
  
  io.to(`match-${match.matchId}`).emit('phase-change', payload);
};

/**
 * Emit server ready notification
 */
export const emitServerReady = (io, match) => {
  io.to(`match-${match.matchId}`).emit('server-ready', {
    matchId: match.matchId,
    serverInfo: {
      ip: match.serverInfo.ip,
      password: match.serverInfo.password,
      map: match.selectedMap,
      connectString: `connect ${match.serverInfo.ip}; password ${match.serverInfo.password}`,
    },
  });
};

/**
 * Emit match complete notification
 */
export const emitMatchComplete = (io, match) => {
  io.to(`match-${match.matchId}`).emit('match-complete', {
    matchId: match.matchId,
    phase: match.phase,
    result: match.result,
  });
};

/**
 * Emit queue full notification (match created)
 */
export const emitQueueFull = (io, matchId) => {
  io.to('queue').emit('queue:full', {
    message: 'Queue is full! Match starting...',
    matchId,
    redirectTo: `/match/${matchId}`,
  });
};

/**
 * Emit player joined queue
 */
export const emitPlayerJoined = (io, player, queueCount) => {
  io.to('queue').emit('queue:player-joined', {
    player: {
      steamId: player.steamId,
      name: player.name,
      avatar: player.avatar,
    },
    count: queueCount,
  });
};

/**
 * Emit player left queue
 */
export const emitPlayerLeft = (io, steamId, queueCount) => {
  io.to('queue').emit('queue:player-left', {
    steamId,
    count: queueCount,
  });
};

export default {
  emitQueueUpdate,
  emitMatchUpdate,
  emitDraftUpdate,
  emitVetoUpdate,
  emitPhaseChange,
  emitServerReady,
  emitMatchComplete,
  emitQueueFull,
  emitPlayerJoined,
  emitPlayerLeft,
};
