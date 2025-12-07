const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const prefPath = () => path.join(app.getPath('userData'), 'preferences.json');
const defaultPrefs = {
  theme: 'light',
  lastDifficulty: 'medium',
  stats: {
    solved: 0,
    totalTime: 0
  },
  gameState: null
};

function loadPreferences() {
  try {
    const data = fs.readFileSync(prefPath(), 'utf-8');
    return { ...defaultPrefs, ...JSON.parse(data) };
  } catch {
    return { ...defaultPrefs };
  }
}

function savePreferences(prefs) {
  try {
    fs.writeFileSync(prefPath(), JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error('Failed to save preferences', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 950,
    minWidth: 1100,
    minHeight: 900,
    title: '',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Keep the native title bar text empty.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('prefs:get', () => {
  return loadPreferences();
});

ipcMain.handle('prefs:set', (_event, update) => {
  const merged = { ...loadPreferences(), ...update };
  savePreferences(merged);
  return merged;
});

ipcMain.handle('prefs:stats', (_event, statsUpdate) => {
  const prefs = loadPreferences();
  const stats = { ...prefs.stats, ...statsUpdate };
  const merged = { ...prefs, stats };
  savePreferences(merged);
  return stats;
});
