const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const fs     = require('fs');
const os     = require('os');
const { autoUpdater } = require('electron-updater');
const { buildMenu } = require('./menu');

// Allow the renderer and main process to address large CAD assemblies (1 GB+).
// Must be set before app.whenReady().
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

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
  buildMenu(app);
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

ipcMain.handle('stl-read', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  function safeRead(p) {
    const raw = fs.readFileSync(p);
    const copy = Buffer.allocUnsafe(raw.length);
    raw.copy(copy);
    return new Uint8Array(copy.buffer, copy.byteOffset, copy.length);
  }

  // Warn before loading very large files so the user isn't surprised by long
  // wait times or an out-of-memory crash.
  const WARN_THRESHOLD = 256 * 1024 * 1024; // 256 MB
  const fileSize = fs.statSync(filePath).size;
  if (fileSize > WARN_THRESHOLD) {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(0);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Load Anyway', 'Cancel'],
      title: 'Large Model File',
      message: `This model is ${sizeMB} MB. Loading may take a while and use significant memory.`,
      detail: 'Complex robot assemblies can be rendered but may be slow to load.',
    });
    if (response === 1) return null;
  }

  if (ext === '.obj') {
    // Parse OBJ in the main process via streaming — reads line by line so the
    // full file text is never held in memory all at once. Only the parsed
    // Float32 geometry arrays are sent over IPC, which is far smaller than the
    // raw text and avoids the extra TextDecoder copy in the renderer.
    const mtlPath = filePath.replace(/\.obj$/i, '.mtl');
    const matMap = new Map();
    if (fs.existsSync(mtlPath)) {
      let cur = null, kd = null;
      for (const line of fs.readFileSync(mtlPath, 'utf8').split('\n')) {
        const t = line.trim();
        if (t.startsWith('newmtl ')) {
          if (cur !== null) matMap.set(cur, kd ?? [0.8, 0.8, 0.8]);
          cur = t.slice(7).trim(); kd = null;
        } else if (t.startsWith('Kd ')) {
          const p = t.split(/\s+/);
          kd = [+p[1], +p[2], +p[3]];
        }
      }
      if (cur !== null) matMap.set(cur, kd ?? [0.8, 0.8, 0.8]);
    }

    const groups = await new Promise((resolve, reject) => {
      const vPos = [], vNor = [];
      const groupMap = new Map();
      let curMat = '__default__';

      const rl = require('readline').createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      rl.on('line', (raw) => {
        const t = raw.trim();
        if (t[0] === 'v' && t[1] === ' ') {
          const p = t.split(/\s+/);
          vPos.push(+p[1], +p[2], +p[3]);
        } else if (t[0] === 'v' && t[1] === 'n' && t[2] === ' ') {
          const p = t.split(/\s+/);
          vNor.push(+p[1], +p[2], +p[3]);
        } else if (t.startsWith('usemtl ')) {
          curMat = t.slice(7).trim();
        } else if (t[0] === 'f' && t[1] === ' ') {
          if (!groupMap.has(curMat)) groupMap.set(curMat, { pos: [], nor: [] });
          const g = groupMap.get(curMat);
          const face = t.slice(2).trim().split(/\s+/).map(tok => {
            const pts = tok.split('/');
            return { vi: (+pts[0] - 1) * 3, ni: pts[2] ? (+pts[2] - 1) * 3 : -1 };
          });
          for (let i = 1; i < face.length - 1; i++) {
            for (const v of [face[0], face[i], face[i + 1]]) {
              g.pos.push(vPos[v.vi], vPos[v.vi + 1], vPos[v.vi + 2]);
              if (v.ni >= 0) g.nor.push(vNor[v.ni], vNor[v.ni + 1], vNor[v.ni + 2]);
            }
          }
        }
      });

      rl.on('close', () => {
        const result = [];
        for (const [name, g] of groupMap) {
          if (!g.pos.length) continue;
          result.push({
            name,
            positions: new Float32Array(g.pos),
            normals: g.nor.length === g.pos.length ? new Float32Array(g.nor) : null,
            color: matMap.get(name) ?? [0.72, 0.74, 0.78],
          });
        }
        resolve(result);
      });

      rl.on('error', reject);
    });

    return { type: 'obj-geo', groups };
  }

  const data = safeRead(filePath);
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
