const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Completely remove default application menus
Menu.setApplicationMenu(null);

let mainWindow;
let serverInstance;
let appPort = 5000;

// Setup persistent log file
const logDir = app.getPath('userData');
const logFile = path.join(logDir, 'app-startup.log');
function logToFile(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (_) {}
  console.log(...args);
}

process.on('uncaughtException', (err) => {
  logToFile('Uncaught Exception:', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  logToFile('Unhandled Rejection:', reason);
});

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#0b1329',
    show: true, // Show immediately to guarantee UI visibility
    title: 'WhatsApp Sender',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const targetUrl = `http://127.0.0.1:${port}`;
  logToFile(`Opening application window for URL: ${targetUrl}`);

  const loadURLWithRetry = (url, retries = 35, delay = 300) => {
    if (!mainWindow) return;
    mainWindow.loadURL(url).then(() => {
      logToFile('Successfully loaded:', url);
    }).catch((err) => {
      logToFile(`Loading ${url}... retrying in ${delay}ms (${retries} left) - ${err.message}`);
      if (retries > 0) {
        setTimeout(() => loadURLWithRetry(url, retries - 1, delay), delay);
      } else {
        logToFile('Failed to load application URL after retries:', err.message);
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>WhatsApp Sender</title>
              <style>
                body { background: #0b1329; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #131d38; padding: 32px; border-radius: 12px; border: 1px solid #1e293b; text-align: center; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                h1 { color: #22c55e; margin-top: 0; font-size: 24px; }
                p { color: #94a3b8; line-height: 1.5; font-size: 14px; }
                button { margin-top: 16px; padding: 10px 28px; background: #22c55e; color: #0b1329; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
                button:hover { background: #16a34a; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>WhatsApp Sender</h1>
                <p>The backend server is initializing on port ${port}. Click below to connect.</p>
                <button onclick="window.location.href='${url}'">Connect to App</button>
              </div>
            </body>
          </html>
        `)}`);
      }
    });
  };

  loadURLWithRetry(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve) => {
    try {
      process.env.ELECTRON_EMBEDDED = '1';
      process.env.USER_DATA_PATH = app.getPath('userData');

      const serverCandidates = [
        path.join(__dirname, 'server', 'index.js'),
        path.join(__dirname, 'index.js'),
        path.join(process.resourcesPath || '', 'server', 'index.js'),
        path.join(process.resourcesPath || '', 'app', 'server', 'index.js'),
        path.join(process.resourcesPath || '', 'app.asar.unpacked', 'server', 'index.js')
      ];

      const serverPath = serverCandidates.find(p => fs.existsSync(p)) || path.join(__dirname, 'server', 'index.js');
      logToFile('[Electron] Loading backend Express server from:', serverPath);

      const serverApp = require(serverPath);

      // Try port 5000 first, fallback to dynamic 0 if in use
      const tryListen = (portToTry) => {
        const server = serverApp.listen(portToTry, '127.0.0.1', () => {
          const actualPort = server.address().port;
          logToFile(`✅ [Electron] Embedded Express Server running on http://127.0.0.1:${actualPort}`);
          serverInstance = server;
          appPort = actualPort;
          resolve(actualPort);
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && portToTry !== 0) {
            logToFile(`Port ${portToTry} in use, picking random open port...`);
            tryListen(0);
          } else {
            logToFile('Server listen error:', err.message);
            resolve(5000);
          }
        });
      };

      tryListen(5000);
    } catch (err) {
      logToFile('Error initiating embedded server:', err.stack || err.message);
      resolve(5000);
    }
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    logToFile("Failed to start application:", err.stack || err.message);
    createWindow(5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && appPort) {
      createWindow(appPort);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    try { serverInstance.close(); } catch (_) {}
  }
});
