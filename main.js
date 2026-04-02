const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const fs     = require('fs');
const os     = require('os');
const { autoUpdater } = require('electron-updater');

// ─── WINDOW ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: 'VADT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // Only check for updates in a packaged build, not during development.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// ─── AUTO-UPDATER ─────────────────────────────────────────────────────────────

autoUpdater.on('update-available', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', 'Downloading update…');
});

autoUpdater.on('update-downloaded', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', 'Update ready — restart to install');
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of VADT has been downloaded. Restart the app to apply it.',
      buttons: ['Restart Now', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: FILE DIALOG ─────────────────────────────────────────────────────────

ipcMain.handle('open-file-dialog', async (event, { filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return result.filePaths[0] || null;
});

// ─── IPC: LOAD LOCAL VIDEO ────────────────────────────────────────────────────
// Returns a file:// URL the renderer can set as a <video> src.

ipcMain.handle('get-file-url', (_event, filePath) => {
  return `file://${filePath.replace(/\\/g, '/')}`;
});

// ─── IPC: YT-DLP DOWNLOAD ─────────────────────────────────────────────────────
// Downloads a time-windowed clip from a YouTube URL.
// Sends 'ytdlp-progress' events back to the renderer during download.

ipcMain.handle('ytdlp-download', async (event, { url, startTime, endTime }) => {
  const outPath = path.join(os.tmpdir(), `vadt_clip_${Date.now()}.mp4`);

  return new Promise((resolve, reject) => {
    const args = [
      '--download-sections', `*${startTime}-${endTime}`,
      '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best',
      '-o', outPath,
      url,
    ];

    const proc = spawn('yt-dlp', args);

    proc.stdout.on('data', d => {
      event.sender.send('ytdlp-progress', { type: 'stdout', text: d.toString() });
    });
    proc.stderr.on('data', d => {
      event.sender.send('ytdlp-progress', { type: 'stderr', text: d.toString() });
    });
    proc.on('close', code => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
    proc.on('error', err => {
      reject(new Error(
        err.code === 'ENOENT'
          ? 'yt-dlp not found — install it from https://github.com/yt-dlp/yt-dlp'
          : err.message
      ));
    });
  });
});

// ─── IPC: CHECK YT-DLP ────────────────────────────────────────────────────────

ipcMain.handle('check-ytdlp', async () => {
  return new Promise(resolve => {
    const proc = spawn('yt-dlp', ['--version']);
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
});

// ─── IPC: OPEN EXTERNAL LINK ──────────────────────────────────────────────────

ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url);
});

// ─── IPC: STL MODEL LIBRARY ───────────────────────────────────────────────────

const modelsDir = path.join(app.getPath('userData'), 'models');
fs.mkdirSync(modelsDir, { recursive: true });

// Helper: find adjacent .mtl file for an OBJ path (same dir, same base name)
function mtlPathFor(objPath) {
  return objPath.replace(/\.obj$/i, '.mtl');
}

ipcMain.handle('stl-save', async (event, srcPath) => {
  const name = path.basename(srcPath);
  const dest = path.join(modelsDir, name);
  const isObj = path.extname(srcPath).toLowerCase() === '.obj';
  const srcMtl = isObj ? mtlPathFor(srcPath) : null;
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];

  if (fs.existsSync(dest)) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Replace', 'Keep Both', 'Cancel'],
      title: 'File Already Exists',
      message: `"${name}" already exists in your model library.`,
    });
    if (response === 2) return null;
    if (response === 1) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      const ts = Date.now();
      const newName = `${base}_${ts}${ext}`;
      const newDest = path.join(modelsDir, newName);
      fs.copyFileSync(srcPath, newDest);
      if (srcMtl && fs.existsSync(srcMtl)) {
        fs.copyFileSync(srcMtl, mtlPathFor(newDest));
      }
      return { name: newName, path: newDest };
    }
  }
  fs.copyFileSync(srcPath, dest);
  if (srcMtl && fs.existsSync(srcMtl)) {
    fs.copyFileSync(srcMtl, mtlPathFor(dest));
  }
  return { name, path: dest };
});

ipcMain.handle('stl-list', async () => {
  if (!fs.existsSync(modelsDir)) return [];
  return fs.readdirSync(modelsDir)
    .filter(f => /\.(stl|glb|gltf|obj)$/i.test(f))
    .map(f => ({ name: f, path: path.join(modelsDir, f) }));
});

ipcMain.handle('stl-delete', async (_event, name) => {
  const p = path.join(modelsDir, name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  // Also remove paired .mtl if this was an OBJ
  if (path.extname(name).toLowerCase() === '.obj') {
    const mtl = mtlPathFor(p);
    if (fs.existsSync(mtl)) fs.unlinkSync(mtl);
  }
});

ipcMain.handle('stl-read', async (_event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  // Return raw Uint8Array — structured clone handles any file size, no base64 needed.
  const data = new Uint8Array(fs.readFileSync(filePath));
  if (ext === '.obj') {
    const mtlPath = mtlPathFor(filePath);
    const mtl = fs.existsSync(mtlPath) ? new Uint8Array(fs.readFileSync(mtlPath)) : null;
    return { type: 'obj', data, mtl };
  }
  const type = (ext === '.glb' || ext === '.gltf') ? ext.slice(1) : 'stl';
  return { type, data };
});

ipcMain.handle('snapshot-save', async (_event, dataUrl) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save View',
    defaultPath: 'cad-view.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });
  if (!filePath) return null;
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
  return filePath;
});

// ─── IPC: GOOGLE AUTH (ELECTRON OAUTH FLOW) ───────────────────────────────────
// Opens a child BrowserWindow for Google sign-in and intercepts the redirect
// back to vexscout.vercel.app to extract the access token without navigating
// the main window away from the Electron app.

ipcMain.handle('google-auth', async (event, authUrl) => {
  return new Promise((resolve, reject) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const authWin = new BrowserWindow({
      width: 500,
      height: 650,
      parent,
      modal: true,
      title: 'Sign in with Google',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    authWin.loadURL(authUrl);

    const tryExtract = (url) => {
      if (!url.includes('vexscout.vercel.app')) return false;
      const hash = url.split('#')[1] || '';
      const token = new URLSearchParams(hash).get('access_token');
      if (!token) return false;
      resolve(token);
      authWin.destroy();
      return true;
    };

    authWin.webContents.on('will-redirect', (e, url) => {
      if (tryExtract(url)) e.preventDefault();
    });

    authWin.webContents.on('will-navigate', (e, url) => {
      if (tryExtract(url)) e.preventDefault();
    });

    authWin.webContents.on('did-navigate', (_e, url) => {
      tryExtract(url);
    });

    authWin.on('closed', () => {
      reject(new Error('closed'));
    });
  });
});
