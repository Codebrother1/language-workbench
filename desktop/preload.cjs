const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("workbenchDesktop", {
  openDataFolder: () => ipcRenderer.invoke("workbench:open-data-folder"),
  openAIStatus: () => ipcRenderer.invoke("workbench:openai-status"),
  saveOpenAIKey: (key) => ipcRenderer.invoke("workbench:openai-save", key),
  removeOpenAIKey: () => ipcRenderer.invoke("workbench:openai-remove"),
});
