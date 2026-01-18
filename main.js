const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let mainWindow;

// ============================================================
// Config Module - Simple JSON persistence
// ============================================================
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

function getSetting(key) {
  const config = loadConfig();
  return config[key];
}

function setSetting(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

// ============================================================
// FFmpeg Detection
// ============================================================
function checkFfmpeg() {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (error, stdout) => {
      if (error) {
        resolve({ available: false, error: error.message });
      } else {
        const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        resolve({ available: true, version });
      }
    });
  });
}

// ============================================================
// IPC Handlers
// ============================================================
ipcMain.handle('check-ffmpeg', async () => {
  return await checkFfmpeg();
});

ipcMain.handle('get-settings', () => {
  return loadConfig();
});

ipcMain.handle('set-setting', (event, key, value) => {
  setSetting(key, value);
  return true;
});

// ============================================================
// Window Creation
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
