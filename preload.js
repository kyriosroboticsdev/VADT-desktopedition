const { contextBridge, ipcRenderer } = require('electron');

// Exposes a safe, controlled API to the renderer (app.js / index.html).
// Nothing from Node.js leaks through — only what is explicitly listed here.

contextBridge.exposeInMainWorld('electronAPI', {

  // Always true when running inside Electron — app.js checks this to
  // decide whether to show desktop-only features.
  isElectron: true,

  // ── File access ──────────────────────────────────────────────────────────
  openFileDialog: (filters) =>
    ipcRenderer.invoke('open-file-dialog', { filters }),

  getFileUrl: (filePath) =>
    ipcRenderer.invoke('get-file-url', filePath),

  // ── yt-dlp ───────────────────────────────────────────────────────────────
  checkYtdlp: () =>
    ipcRenderer.invoke('check-ytdlp'),

  downloadClip: (url, startTime, endTime) =>
    ipcRenderer.invoke('ytdlp-download', { url, startTime, endTime }),

  onDownloadProgress: (callback) =>
    ipcRenderer.on('ytdlp-progress', (_event, data) => callback(data)),

  removeDownloadListeners: () =>
    ipcRenderer.removeAllListeners('ytdlp-progress'),

  // ── Google OAuth ──────────────────────────────────────────────────────────
  googleAuth: (authUrl) =>
    ipcRenderer.invoke('google-auth', authUrl),

  // ── Updates ───────────────────────────────────────────────────────────────
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, msg) => callback(msg)),

  // ── Utilities ─────────────────────────────────────────────────────────────
  openExternal: (url) =>
    ipcRenderer.invoke('open-external', url),

});
