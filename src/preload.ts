import { contextBridge, ipcRenderer } from 'electron';

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  selectProcessPath: () => ipcRenderer.invoke('select-process-path'),
  restartProcess: () => ipcRenderer.invoke('restart-process'),
  importCert: (type: 'cloudlinkkit' | 'app') => ipcRenderer.invoke('import-cert', type),
  addHostEntry: () => ipcRenderer.invoke('add-host-entry'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  checkAutoStart: () => ipcRenderer.invoke('check-auto-start'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
});

// 类型定义
declare global {
  interface Window {
    electronAPI: {
      getStatus: () => Promise<any>;
      selectProcessPath: () => Promise<string | null>;
      restartProcess: () => Promise<{ success: boolean; error?: string }>;
      importCert: (type: 'cloudlinkkit' | 'app') => Promise<{ success: boolean; error?: string }>;
      addHostEntry: () => Promise<{ success: boolean; error?: string }>;
      setAutoStart: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
      checkAutoStart: () => Promise<{ enabled: boolean; error?: string }>;
      getLogPath: () => Promise<{ logDir: string | null; logFile: string | null }>;
    };
  }
}

