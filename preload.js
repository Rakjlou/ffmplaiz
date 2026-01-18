const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // FFmpeg detection
  checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // File utilities (Electron 32+ requires webUtils for file paths)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Commands
  loadCommands: () => ipcRenderer.invoke('load-commands'),

  // Output folder
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),

  // Processing
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  stopProcessing: () => ipcRenderer.invoke('stop-processing'),
  onFfmpegOutput: (callback) => {
    ipcRenderer.on('ffmpeg-output', (event, data) => callback(data));
  },
  removeFfmpegOutputListener: () => {
    ipcRenderer.removeAllListeners('ffmpeg-output');
  },

  // Session logging
  startSessionLog: () => ipcRenderer.invoke('start-session-log'),
  appendToLog: (text) => ipcRenderer.invoke('append-to-log', text),
  getSessionLogPath: () => ipcRenderer.invoke('get-session-log-path'),

  // Shell operations
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath)
});
