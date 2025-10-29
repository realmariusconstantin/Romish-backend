// Quick diagnostic - check if backend is emitting accept phase event
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  withCredentials: true,
});

socket.on('connect', () => {
  console.log('✅ Connected to backend socket');
  socket.emit('join-queue');
  console.log('📡 Joined queue room');
});

socket.on('accept-phase-started', (data) => {
  console.log('🎯 ACCEPT PHASE STARTED EVENT RECEIVED!');
  console.log('Data:', data);
});

socket.on('queue:updated', (data) => {
  console.log('📋 Queue updated:', data.players?.length, 'players');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from backend');
});

console.log('🔍 Listening for events...');
console.log('💡 Now run the test script in another terminal');

// Keep process alive
setInterval(() => {}, 1000);
