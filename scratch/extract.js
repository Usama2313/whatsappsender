const fs = require('fs');
const readline = require('readline');

async function extractFiles() {
  const logPath = 'C:\\Users\\Syed\\.gemini\\antigravity-ide\\brain\\4b43d573-634d-4eec-9960-761681c9f133\\.system_generated\\logs\\transcript_full.jsonl';
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let componentsFiles = new Map(); // filepath -> content
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      // look for view_file or write_to_file or replace_file_content tool responses or calls
      if (entry.tool_calls) {
        for (const call of entry.tool_calls) {
          if (call.name === 'default_api:write_to_file' || call.name === 'default_api:replace_file_content') {
             // check if it's creating quran stuff or overwriting old stuff
             // actually it's easier to find view_file responses
          }
        }
      }
      if (entry.type === 'TOOL_RESPONSE' && entry.content) {
        if (entry.content.includes('File Path: `file:///c:/Users/Syed/Downloads/whatsapp-sender/client/src/')) {
          const lines = entry.content.split('\n');
          let filePath = '';
          for (const l of lines) {
             if (l.startsWith('File Path: `file:///')) {
                filePath = l.split('`')[1].replace('file:///', '').replace(/\//g, '\\');
             }
          }
          // extract the content (lines that start with numbers followed by : )
          let contentLines = [];
          let isCode = false;
          for (let i = 0; i < lines.length; i++) {
             const match = lines[i].match(/^\d+:\s(.*)/);
             if (match) {
                 contentLines.push(match[1]);
                 isCode = true;
             } else if (isCode && lines[i].trim() === 'The above content shows the entire, complete file contents of the requested file.') {
                 break;
             }
          }
          if (contentLines.length > 0 && filePath) {
             if (!componentsFiles.has(filePath)) {
                 componentsFiles.set(filePath, contentLines.join('\n'));
             }
          }
        }
      }
    } catch (e) {}
  }

  for (const [path, content] of componentsFiles.entries()) {
    console.log('Found history of:', path);
    if (path.includes('App.jsx') && content.includes('Teacher')) {
       // Ignore the teacher app.jsx
       console.log(' Ignoring Teacher App.jsx');
    } else {
       fs.writeFileSync('C:\\Users\\Syed\\Downloads\\whatsapp-sender\\scratch\\' + path.split('\\').pop() + '.txt', content);
       console.log(' -> saved to scratch');
    }
  }
}

extractFiles();
