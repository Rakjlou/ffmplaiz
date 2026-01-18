const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // FFmpeg detection
  checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // File utilities (Electron 32+ requires webUtils for file paths)
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
