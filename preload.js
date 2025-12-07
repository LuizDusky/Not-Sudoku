const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getPreferences: async () => ipcRenderer.invoke('prefs:get'),
  setPreferences: async (prefs) => ipcRenderer.invoke('prefs:set', prefs),
  updateStats: async (stats) => ipcRenderer.invoke('prefs:stats', stats)
});
