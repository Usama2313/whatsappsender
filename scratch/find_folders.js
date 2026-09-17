const fs = require('fs');
const path = require('path');

function scanDir(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name.toLowerCase();
        if (name === 'node_modules' || name === '.git' || name === '.gemini' || name === '.cursor' || name === 'appdata') continue;
        const fullPath = path.join(dir, entry.name);
        if (name.includes('whatsapp') || name.includes('sender') || name.includes('twilio') || name.includes('bulk')) {
          console.log('MATCH DIR:', fullPath);
        }
        scanDir(fullPath, depth + 1);
      } else if (entry.name === 'package.json') {
        const fullPath = path.join(dir, entry.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.toLowerCase().includes('whatsapp') || content.toLowerCase().includes('twilio')) {
            console.log('MATCH PKG:', fullPath);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

console.log('Scanning C:\\Users\\Syed...');
scanDir('C:\\Users\\Syed');
console.log('Done scanning.');
