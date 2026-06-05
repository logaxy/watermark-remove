import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("watermarkApi", {
  selectVideos: () => ipcRenderer.invoke("files:selectVideos"),
  probeVideo: (path: string) => ipcRenderer.invoke("videos:probe", path),
  startJob: (payload: unknown) => ipcRenderer.invoke("jobs:start", payload),
  cancelJob: () => ipcRenderer.invoke("jobs:cancel"),
  onJobEvent: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("jobs:event", listener);
    return () => ipcRenderer.off("jobs:event", listener);
  }
});
