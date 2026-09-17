const fs = require('fs');
const path = require('path');

const userDataPath = process.env.USER_DATA_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(userDataPath)) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
  } catch (_) {}
}

const dbFilePath = path.join(userDataPath, 'messages.json');
const settingsFilePath = path.join(userDataPath, 'settings.json');

// In-memory message store with disk persistence
let messages = [];
let settings = {};

function loadData() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      messages = JSON.parse(raw);
      if (!Array.isArray(messages)) messages = [];
    }
  } catch (err) {
    console.error('[db] Error loading messages from disk:', err.message);
    messages = [];
  }

  try {
    if (fs.existsSync(settingsFilePath)) {
      const rawSettings = fs.readFileSync(settingsFilePath, 'utf-8');
      settings = JSON.parse(rawSettings);
      if (typeof settings !== 'object' || settings === null) settings = {};
    }
  } catch (err) {
    console.error('[db] Error loading settings from disk:', err.message);
    settings = {};
  }
}

function saveData() {
  try {
    fs.writeFileSync(dbFilePath, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (err) {
    console.error('[db] Error saving messages to disk:', err.message);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[db] Error saving settings to disk:', err.message);
  }
}

loadData();

const db = {
  pragma: () => {},
  exec: () => {},
  prepare: (sql) => {
    const normalized = sql.trim().toLowerCase();

    // INSERT INTO settings / REPLACE INTO settings
    if (normalized.includes('into settings')) {
      return {
        run: (key, val) => {
          if (key !== undefined) {
            settings[key] = val !== undefined ? String(val) : '';
            saveSettings();
          }
        }
      };
    }

    // SELECT value FROM settings WHERE key = ?
    if (normalized.includes('from settings where key = ?')) {
      return {
        get: (key) => {
          return settings[key] !== undefined ? { value: settings[key] } : undefined;
        }
      };
    }

    // SELECT * FROM settings
    if (normalized.includes('from settings')) {
      return {
        all: () => Object.entries(settings).map(([k, v]) => ({ key: k, value: v }))
      };
    }

    // INSERT INTO messages
    if (normalized.startsWith('insert into messages')) {
      return {
        run: (params) => {
          if (!params || !params.id) return;
          const exists = messages.some(m => m.id === params.id);
          if (!exists) {
            messages.push({
              id: params.id,
              from: params.from || '',
              to: params.to || '',
              body: params.body || '',
              timestamp: params.timestamp || new Date().toISOString(),
              media: params.media || '[]',
              channel: params.channel || 'whatsapp',
              isOutgoing: params.isOutgoing ? 1 : 0
            });
            saveData();
          }
        }
      };
    }

    // SELECT * FROM messages ORDER BY timestamp DESC LIMIT 200
    if (normalized.includes('order by timestamp desc') && !normalized.includes('group by') && !normalized.includes('where')) {
      return {
        all: () => {
          return [...messages]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 200);
        }
      };
    }

    // SELECT "from" as number, MAX(timestamp) as lastReply FROM messages WHERE isOutgoing = 0 AND timestamp >= ? GROUP BY "from" ORDER BY lastReply DESC
    if (normalized.includes('group by "from"') || (normalized.includes('max(timestamp)') && normalized.includes('isoutgoing = 0'))) {
      return {
        all: (sinceTimestamp) => {
          const filtered = messages.filter(m => m.isOutgoing === 0 && (!sinceTimestamp || m.timestamp >= sinceTimestamp));
          const groups = {};
          for (const m of filtered) {
            const key = m.from;
            if (!groups[key] || new Date(m.timestamp) > new Date(groups[key].lastReply)) {
              groups[key] = {
                number: m.from,
                lastReply: m.timestamp
              };
            }
          }
          return Object.values(groups).sort((a, b) => new Date(b.lastReply) - new Date(a.lastReply));
        }
      };
    }

    // SELECT channel, id FROM messages WHERE "from" = ? OR "to" = ? ORDER BY timestamp DESC LIMIT 1
    if (normalized.includes('where "from" = ? or "to" = ?') || normalized.includes('where from = ? or to = ?')) {
      return {
        get: (fromVal, toVal) => {
          const match = [...messages]
            .filter(m => m.from === fromVal || m.to === toVal || m.from === `whatsapp:${fromVal}` || m.to === `whatsapp:${toVal}`)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
          return match ? { channel: match.channel, id: match.id } : undefined;
        }
      };
    }

    // Default fallback
    return {
      run: () => {},
      all: () => [],
      get: () => undefined
    };
  }
};

module.exports = db;
