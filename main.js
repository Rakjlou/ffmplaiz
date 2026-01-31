const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

let mainWindow;
let currentProcess = null; // Current FFmpeg process
let sessionLogPath = null; // Current session log file path

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
// Commands Loading
// ============================================================
function getCommandsPath() {
  // In development: use app directory
  // In production: use resourcesPath (next to executable)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'commands.json');
  }
  return path.join(__dirname, 'commands.json');
}

function loadCommands() {
  const commandsPath = getCommandsPath();
  try {
    if (!fs.existsSync(commandsPath)) {
      return { success: false, error: `Commands file not found: ${commandsPath}` };
    }
    const data = fs.readFileSync(commandsPath, 'utf-8');
    const parsed = JSON.parse(data);

    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      return { success: false, error: 'Invalid commands.json: missing "commands" array' };
    }

    return { success: true, commands: parsed.commands };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: `Invalid JSON syntax: ${err.message}` };
    }
    return { success: false, error: `Error loading commands: ${err.message}` };
  }
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

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-settings', () => {
  return loadConfig();
});

ipcMain.handle('set-setting', (event, key, value) => {
  setSetting(key, value);
  return true;
});

ipcMain.handle('load-commands', () => {
  return loadCommands();
});

function saveCommands(commandsArray) {
  const commandsPath = getCommandsPath();
  const data = { commands: commandsArray };
  fs.writeFileSync(commandsPath, JSON.stringify(data, null, 2), 'utf-8');
  return { success: true };
}

ipcMain.handle('save-commands', (event, commands) => saveCommands(commands));

ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Output Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { selected: false };
  }

  const folderPath = result.filePaths[0];
  setSetting('lastOutputDirectory', folderPath);
  return { selected: true, path: folderPath };
});

// ============================================================
// Processing
// ============================================================
ipcMain.handle('execute-command', async (event, command) => {
  return new Promise((resolve) => {
    // Use shell: true to let Node.js handle shell invocation properly
    // This avoids quote/escaping issues with cmd /c on Windows
    const proc = spawn(command, [], {
      shell: true,
      windowsHide: true
    });

    currentProcess = proc;

    // Stream stdout to renderer
    proc.stdout.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ffmpeg-output', {
          type: 'stdout',
          data: data.toString()
        });
      }
    });

    // Stream stderr to renderer (FFmpeg outputs progress to stderr)
    proc.stderr.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ffmpeg-output', {
          type: 'stderr',
          data: data.toString()
        });
      }
    });

    proc.on('close', (code) => {
      currentProcess = null;
      resolve({
        success: code === 0,
        exitCode: code
      });
    });

    proc.on('error', (err) => {
      currentProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ffmpeg-output', {
          type: 'stderr',
          data: `Error: ${err.message}\n`
        });
      }
      resolve({
        success: false,
        exitCode: -1,
        error: err.message
      });
    });
  });
});

ipcMain.handle('stop-processing', () => {
  if (currentProcess) {
    // On Windows, we need to kill the process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', currentProcess.pid, '/f', '/t']);
    } else {
      currentProcess.kill('SIGTERM');
    }
    currentProcess = null;
  }
  return true;
});

// ============================================================
// Session Logging
// ============================================================
ipcMain.handle('start-session-log', () => {
  // Create a new session log file in temp directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  sessionLogPath = path.join(app.getPath('temp'), `ffmplaiz_session_${timestamp}.txt`);

  // Write header
  const header = `ffmplaiz Session Log\nStarted: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  fs.writeFileSync(sessionLogPath, header, 'utf-8');

  return sessionLogPath;
});

ipcMain.handle('append-to-log', (event, text) => {
  if (sessionLogPath) {
    fs.appendFileSync(sessionLogPath, text, 'utf-8');
  }
  return true;
});

ipcMain.handle('get-session-log-path', () => {
  return sessionLogPath;
});

// ============================================================
// Multi-File Operations
// ============================================================
ipcMain.handle('create-concat-file', async (event, files, timestamp) => {
  try {
    // Create concat file in temp directory
    const concatPath = path.join(app.getPath('temp'), `ffmplaiz_concat_${timestamp}.txt`);

    // Format: file 'path/to/video1.mp4'
    // Escape single quotes in paths, use forward slashes
    const lines = files.map(file => {
      const filePath = file.path.replace(/\\/g, '/').replace(/'/g, "\\'");
      return `file '${filePath}'`;
    });

    fs.writeFileSync(concatPath, lines.join('\n'), 'utf-8');
    return concatPath;
  } catch (err) {
    console.error('Error creating concat file:', err);
    return null;
  }
});

ipcMain.handle('delete-concat-file', async (event, concatPath) => {
  try {
    if (concatPath && fs.existsSync(concatPath)) {
      fs.unlinkSync(concatPath);
    }
    return true;
  } catch (err) {
    console.error('Error deleting concat file:', err);
    return true; // Non-critical cleanup, return success anyway
  }
});

// ============================================================
// Shell Operations (open folder/file)
// ============================================================
ipcMain.handle('open-folder', async (event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
    return true;
  }
  return false;
});

ipcMain.handle('open-file', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath);
    return true;
  }
  return false;
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
