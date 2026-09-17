const fs = require('fs');
const readline = require('readline');

async function extractFiles() {
  const logPath = 'C:\\Users\\Syed\\.gemini\\antigravity-ide\\brain\\4b43d573-634d-4eec-9960-761681c9f133\\.system_generated\\logs\\transcript_full.jsonl';
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let i = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      // check tool calls
      if (entry.tool_calls) {
        for (const call of entry.tool_calls) {
          if (call.name === 'default_api:write_to_file' || call.name === 'default_api:replace_file_content') {
             const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
             if (args.TargetFile && (args.TargetFile.includes('MessagesTab.jsx') || args.TargetFile.includes('App.jsx'))) {
                console.log('Found write to:', args.TargetFile);
                fs.writeFileSync(`C:\\Users\\Syed\\Downloads\\whatsapp-sender\\scratch\\extract_${i}.txt`, args.CodeContent || args.ReplacementContent || '');
                i++;
             }
          }
        }
      }
      
      // also check view file outputs
      if (entry.type === 'TOOL_RESPONSE' && entry.content && entry.content.includes('MessagesTab.jsx')) {
          console.log('Found MessagesTab in tool response!');
          fs.writeFileSync(`C:\\Users\\Syed\\Downloads\\whatsapp-sender\\scratch\\response_${i}.txt`, entry.content);
          i++;
      }
    } catch (e) {}
  }
}

extractFiles();
