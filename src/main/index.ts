import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { WSSServer } from './wss-server';
import { ProcessManager } from './process-manager';
import { CertManager } from './cert-manager';
import { HostManager } from './host-manager';
import { AutoStartManager } from './auto-start';

let mainWindow: BrowserWindow | null = null;
let wssServer: WSSServer | null = null;

const processManager = new ProcessManager();
const certManager = new CertManager();
const hostManager = new HostManager();
const autoStartManager = new AutoStartManager();

// 日志文件路径（延迟初始化）
let logDir: string | null = null;
let logFile: string | null = null;

// 初始化日志目录
function initLogDir() {
  if (!logDir) {
    try {
      logDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    } catch (err) {
      console.error('Failed to initialize log directory:', err);
    }
  }
}

// 日志函数
function log(message: string, level: 'info' | 'error' | 'warn' = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  // 输出到控制台
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }

  // 写入日志文件（如果已初始化）
  if (logFile) {
    try {
      fs.appendFileSync(logFile, logMessage, 'utf8');
    } catch (err) {
      // 如果写入失败，至少输出到控制台
      console.error('Failed to write log:', err);
    }
  }
}

// 检查是否以管理员权限运行
function isAdmin(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    // Windows 上检查管理员权限
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createWindow() {
  log('Creating main window...');
  log(`Running as admin: ${isAdmin()}`);
  log(`App path: ${app.getPath('exe')}`);
  log(`User data: ${app.getPath('userData')}`);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: true, // 明确设置为显示
    skipTaskbar: false, // 确保显示在任务栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: app.isPackaged
        ? path.join(__dirname, '../preload.js')
        : path.join(__dirname, '../preload.js'),
    },
    icon: path.join(__dirname, '../../resources/icon.ico'),
  });

  // 确保窗口显示并置于前台
  mainWindow.once('ready-to-show', () => {
    log('Window ready to show');
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
      log('Window shown and focused');
    }
  });

  // 开发环境加载 Vite 开发服务器，生产环境加载构建后的文件
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log('Loading development URL: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      log(`Failed to load URL: ${err}`, 'error');
    });
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    log(`Loading production file: ${htmlPath}`);
    mainWindow.loadFile(htmlPath).catch((err) => {
      log(`Failed to load file: ${err}`, 'error');
    });
  }

  mainWindow.on('closed', () => {
    log('Window closed');
    mainWindow = null;
  });

  mainWindow.on('show', () => {
    log('Window shown event');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`Failed to load: ${errorCode} - ${errorDescription}`, 'error');
  });

  mainWindow.webContents.on('crashed', () => {
    log('Renderer process crashed', 'error');
  });
}

async function initializeWSS() {
  try {
    log('Initializing WSS server...');
    // 获取应用证书路径
    const appCertPath = app.isPackaged
      ? path.join(process.resourcesPath, 'resources', 'app-cert')
      : path.join(__dirname, '../../resources/app-cert');

    log(`App cert path: ${appCertPath}`);

    wssServer = new WSSServer(processManager, certManager, hostManager);
    wssServer.setAppCertPath(appCertPath);

    await wssServer.start();
    log('WSS server initialized successfully');
  } catch (error) {
    log(`Failed to initialize WSS server: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// IPC 处理程序
function setupIPC() {
  // 获取状态
  ipcMain.handle('get-status', async () => {
    try {
      const processStatus = await processManager.getStatus();

      let certStatus = {
        cloudlinkKitInstalled: false,
        appCertInstalled: false,
      };

      const sdkPath = processManager.getProcessPath();
      if (sdkPath) {
        const sdkDir = path.dirname(sdkPath);
        const appCertPath = app.isPackaged
          ? path.join(process.resourcesPath, 'resources', 'app-cert')
          : path.join(__dirname, '../../resources/app-cert');

        certStatus = await certManager.checkAllCerts(sdkDir, appCertPath);
      }

      const hostStatus = {
        entryPresent: await hostManager.isHostEntryPresent(),
      };

      return {
        wssServerRunning: wssServer?.isRunning() || false,
        processStatus,
        certStatus,
        hostStatus,
      };
    } catch (error) {
      console.error('Error getting status:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // 选择进程路径
  ipcMain.handle('select-process-path', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      title: 'Select CloudLinkKitDaemon.exe',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      processManager.setProcessPath(selectedPath);

      // 更新 WSS 服务器的 SDK 路径
      if (wssServer) {
        wssServer.setSDKPath(path.dirname(selectedPath));
      }

      return selectedPath;
    }
    return null;
  });

  // 重启进程
  ipcMain.handle('restart-process', async () => {
    try {
      log('Restarting process...');
      const result = await processManager.restartProcess();
      if (result.success) {
        log('Process restarted successfully');
      } else {
        log(`Process restart failed: ${result.error || 'Unknown error'}`, 'error');
      }
      return result;
    } catch (error: any) {
      log(`Process restart error: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message || 'Failed to restart process',
      };
    }
  });

  // 导入证书
  ipcMain.handle('import-cert', async (event, type: 'cloudlinkkit' | 'app') => {
    try {
      const sdkPath = processManager.getProcessPath();
      if (!sdkPath) {
        throw new Error('Please select process path first');
      }

      const sdkDir = path.dirname(sdkPath);
      const appCertPath = app.isPackaged
        ? path.join(process.resourcesPath, 'resources', 'app-cert')
        : path.join(__dirname, '../../resources/app-cert');

      let installResult: boolean;
      let certPath: string;

      if (type === 'cloudlinkkit') {
        certPath = path.join(sdkDir, 'root.crt');
        installResult = await certManager.installCloudlinkKitCert(sdkDir);
      } else {
        certPath = path.join(appCertPath, 'root.crt');
        installResult = await certManager.installAppCert(appCertPath);
      }

      // 检查安装结果，如果失败则返回错误
      if (!installResult) {
        // 添加重试机制，等待证书检查完成（最多等待3秒，每次间隔500ms）
        let verified = false;
        for (let i = 0; i < 6; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          verified = await certManager.isCertInstalled(certPath);
          if (verified) {
            break;
          }
        }

        if (!verified) {
          return {
            success: false,
            error: 'Certificate installation completed but verification failed. Please check if administrator privileges are required.',
          };
        }
      }

      return { success: true };
    } catch (error: any) {
      log(`Certificate import failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message || 'Failed to import certificate',
      };
    }
  });

  // 追加 host 条目
  ipcMain.handle('add-host-entry', async () => {
    try {
      const success = await hostManager.addHostEntry();
      return { success };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to add host entry',
      };
    }
  });

  // 设置开机自启动
  ipcMain.handle('set-auto-start', async (event, enabled: boolean) => {
    try {
      if (enabled) {
        const appPath = app.getPath('exe');
        await autoStartManager.enableAutoStart(appPath);
      } else {
        await autoStartManager.disableAutoStart();
      }
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to set auto-start',
      };
    }
  });

  // 检查开机自启动状态
  ipcMain.handle('check-auto-start', async () => {
    try {
      const enabled = await autoStartManager.isAutoStartEnabled();
      return { enabled };
    } catch (error: any) {
      return {
        enabled: false,
        error: error.message,
      };
    }
  });

  // 获取日志文件路径
  ipcMain.handle('get-log-path', async () => {
    return {
      logDir: logDir || null,
      logFile: logFile || null,
    };
  });
}

app.whenReady().then(async () => {
  // 初始化日志目录
  initLogDir();

  log('App ready, initializing...');
  log(`Platform: ${process.platform}`);
  log(`Node version: ${process.version}`);
  log(`Electron version: ${process.versions.electron}`);

  try {
    createWindow();
    setupIPC();
    await initializeWSS();
    log('App initialization completed');
  } catch (error) {
    log(`App initialization failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }

  app.on('activate', () => {
    log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('ready', () => {
  log('App ready event fired');
});

app.on('window-all-closed', async () => {
  log('All windows closed');
  if (wssServer) {
    await wssServer.stop();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  log('App quitting...');
  if (wssServer) {
    await wssServer.stop();
  }
});

// 捕获未处理的错误
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  log(`Stack: ${error.stack}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection: ${reason}`, 'error');
});

