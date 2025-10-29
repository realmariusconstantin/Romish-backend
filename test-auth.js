#!/usr/bin/env node

/**
 * Test auth endpoints
 */

async function testAuth() {
  const baseUrl = 'http://localhost:5000/api/auth';
  
  try {
    console.log('Testing auth endpoints...\n');
    
    // Test 1: Test endpoint
    console.log('1. Testing /api/auth/test');
    const testRes = await fetch(`${baseUrl}/test`);
    console.log('Status:', testRes.status);
    console.log('Body:', await testRes.json());
    console.log('');
    
    // Test 2: Steam endpoint (just check if it responds)
    console.log('2. Testing /api/auth/steam');
    const steamRes = await fetch(`${baseUrl}/steam`, { redirect: 'manual' });
    console.log('Status:', steamRes.status);
    console.log('Headers:', Object.fromEntries(steamRes.headers));
    console.log('');
    
    console.log('Auth tests completed!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAuth();
