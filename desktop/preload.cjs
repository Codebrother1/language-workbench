const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("workbenchDesktop", {
  openDataFolder: () => ipcRenderer.invoke("workbench:open-data-folder"),
});
