export default {
  // Use Node environment for backend tests
  testEnvironment: 'node',
  
  // Enable ES modules support
  transform: {},
  
  // Module name mapper for ES module imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setupTestDB.js'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude server entry point
    '!src/app.js', // Exclude app setup
  ],
  
  // Increase timeout for integration tests
  testTimeout: 30000,
  
  // Run tests serially to avoid port conflicts
  maxWorkers: 1,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
};
