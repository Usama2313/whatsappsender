/**
 * start-with-tunnel.js
 * Starts the WhatsApp sender server + a Cloudflare Tunnel in one step.
 * The tunnel URL is automatically used for all uploaded media so Twilio can fetch it.
 * 
 * Usage: node start-with-tunnel.js
 */
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

let tunnelUrl = null;
let serverProcess = null;
let tunnelProcess = null;

// --- Start the backend server ---
function startServer() {
  console.log('🚀 Starting WhatsApp Sender backend...');
  serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
  serverProcess.on('exit', (code) => {
    console.log('Server exited with code', code);
  });
}

// --- Start cloudflare tunnel ---
function startTunnel() {
  return new Promise((resolve, reject) => {
    console.log('🌐 Starting Cloudflare Tunnel on port 5000...');
    
    // Write tunnel output to a temp log so we can parse the URL
    const logFile = path.join(__dirname, 'tunnel.log');
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });

    tunnelProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5000'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tunnelProcess.stdout.pipe(logStream);
    tunnelProcess.stderr.pipe(logStream);

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write('[tunnel] ' + text);
      extractTunnelUrl(text, resolve);
    });

    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write('[tunnel] ' + text);
      extractTunnelUrl(text, resolve);
    });

    tunnelProcess.on('exit', (code) => {
      if (!tunnelUrl) reject(new Error('Tunnel exited before providing URL'));
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!tunnelUrl) reject(new Error('Timeout: Cloudflare tunnel did not start in 30s'));
    }, 30000);
  });
}

function extractTunnelUrl(text, resolve) {
  // Match https://<something>.trycloudflare.com
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    console.log('\n✅ Tunnel URL:', tunnelUrl);
    console.log('   Media files will be served at:', tunnelUrl + '/uploads/<filename>');
    console.log('   Share this URL with Twilio by setting PUBLIC_URL env variable.\n');
    
    // Write URL to a .tunnelurl file for the server to pick up
    fs.writeFileSync(path.join(__dirname, '.tunnelurl'), tunnelUrl);
    resolve(tunnelUrl);
  }
}

async function main() {
  require('dotenv').config();
  
  // Check cloudflared is available
  try {
    execSync('cloudflared version', { stdio: 'pipe' });
  } catch (e) {
    console.error('❌ cloudflared not found. Install via: winget install Cloudflare.cloudflared');
    process.exit(1);
  }

  // Start server first
  startServer();

  // Wait a moment for server to come up
  await new Promise(r => setTimeout(r, 2000));

  // Start tunnel
  try {
    const url = await startTunnel();
    console.log('\n🎉 Everything is running!');
    console.log('   Backend: http://localhost:5000');
    console.log('   Tunnel:  ' + url);
    console.log('   Frontend: http://localhost:3000');
    console.log('\n📋 IMPORTANT: Set this as PUBLIC_URL in your .env file:');
    console.log('   PUBLIC_URL=' + url);
    console.log('\n   Then restart the server for media uploads to use the tunnel URL.');
    console.log('\n⚠️  Recipients must first WhatsApp your number (' + (process.env.TWILIO_WHATSAPP_NUMBER || '+12293042460') + ')');
    console.log('   to open a 24h session before receiving custom media.\n');
  } catch (e) {
    console.error('❌ Tunnel failed:', e.message);
  }

  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (serverProcess) serverProcess.kill();
    if (tunnelProcess) tunnelProcess.kill();
    process.exit(0);
  });
}

main().catch(console.error);
