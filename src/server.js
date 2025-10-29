import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import config from './config/env.js';
import { createSockets, shutdownSockets } from './sockets/index.js';

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with namespaces
let io = null;
let matchNsp = null;
let chatNsp = null;

const initializeSockets = async () => {
  try {
    const sockets = await createSockets(httpServer, {
      cors: {
        origin: config.frontendUrl,
        credentials: true,
        methods: ['GET', 'POST'],
      },
    });
    io = sockets.io;
    matchNsp = sockets.matchNsp;
    chatNsp = sockets.chatNsp;

    // Attach to app for use in controllers
    app.set('io', io);
    app.set('matchNsp', matchNsp);
    app.set('chatNsp', chatNsp);

    return sockets;
  } catch (error) {
    console.error('Failed to initialize sockets:', error);
    throw error;
  }
};

// Keep reference for shutdown
let socketsInstance = null;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Socket.IO namespaces
    socketsInstance = await initializeSockets();

    // Expose global io reference for legacy modules that use global.io
    try {
      global.io = app.get('io');
      console.log('Global Socket.IO instance attached to global.io');
    } catch (e) {
      console.warn('Could not attach global.io:', e.message);
    }

    // Start listening
    httpServer.listen(config.port, () => {
      console.log('╔════════════════════════════════════════╗');
      console.log('║       Romish.gg Backend Server         ║');
      console.log('╚════════════════════════════════════════╝');
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
      console.log(`MongoDB: Connected`);
      console.log(`Socket.IO: Enabled (namespaces: /match, /chat)`);
      console.log('Ready for connections...\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  shutdownSockets();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  shutdownSockets();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In production we want to exit so process managers can restart the app.
  // In development keep the server running to avoid disrupting local testing.
  if (config.nodeEnv === 'production') {
    process.exit(1);
  } else {
    console.warn('Development mode: not exiting on uncaught exception');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (config.nodeEnv === 'production') {
    process.exit(1);
  } else {
    console.warn('Development mode: not exiting on unhandled rejection');
  }
});

// Start the server
startServer();

// Export for testing
export { io, httpServer };
