const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'messages.db'));

const insertMessage = db.prepare(`
  INSERT INTO messages (id, "from", "to", body, timestamp, media, channel, isOutgoing)
  VALUES (@id, @from, @to, @body, @timestamp, @media, @channel, @isOutgoing)
  ON CONFLICT(id) DO NOTHING
`);

insertMessage.run({
  id: 'msg_test_db_2',
  from: '+1234567890',
  to: '+0987654321',
  body: 'Hello from DB test script!',
  timestamp: new Date().toISOString(),
  media: '[]',
  channel: 'whatsapp',
  isOutgoing: 0
});

const getMessages = db.prepare(`SELECT * FROM messages`);
console.log(getMessages.all());
