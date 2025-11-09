import * as WebSocket from 'ws';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from './process-manager';
import { CertManager } from './cert-manager';
import { HostManager } from './host-manager';

export interface WSSMessage {
  action: 'status' | 'restart';
  payload?: any;
}

export interface StatusResponse {
  wssServerRunning: boolean;
  processStatus: {
    isRunning: boolean;
    pid?: number;
    port7684Open: boolean;
  };
  certStatus: {
    cloudlinkKitInstalled: boolean;
    appCertInstalled: boolean;
  };
  hostStatus: {
    entryPresent: boolean;
  };
}

export class WSSServer {
  private server: https.Server | null = null;
  private wss: WebSocket.Server | null = null;
  private port: number = 53005;
  private processManager: ProcessManager;
  private certManager: CertManager;
  private hostManager: HostManager;
  private sdkPath: string = '';
  private appCertPath: string = '';

  constructor(
    processManager: ProcessManager,
    certManager: CertManager,
    hostManager: HostManager
  ) {
    this.processManager = processManager;
    this.certManager = certManager;
    this.hostManager = hostManager;
  }

  setSDKPath(path: string) {
    this.sdkPath = path;
  }

  setAppCertPath(path: string) {
    this.appCertPath = path;
  }

  /**
   * 启动 WSS 服务器
   */
  async start(): Promise<void> {
    if (this.server) {
      return; // 已经启动
    }

    try {
      // 加载证书
      const certPath = path.join(this.appCertPath, 'server.crt');
      const keyPath = path.join(this.appCertPath, 'server.key');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        throw new Error('Server certificate not found. Please generate certificates first.');
      }

      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);

      // 创建 HTTPS 服务器
      this.server = https.createServer({ cert, key });

      // 创建 WebSocket 服务器
      this.wss = new WebSocket.Server({ server: this.server });

      this.wss.on('connection', (ws: WebSocket) => {
        console.log('WSS client connected');

        ws.on('message', async (message: Buffer) => {
          try {
            const data: WSSMessage = JSON.parse(message.toString());
            await this.handleMessage(ws, data);
          } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
              error: 'Invalid message format',
            }));
          }
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
        });

        ws.on('close', () => {
          console.log('WSS client disconnected');
        });
      });

      // 启动服务器
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.port, '127.0.0.1', () => {
          console.log(`WSS server started on wss://127.0.0.1:${this.port}`);
          resolve();
        });

        this.server!.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to start WSS server:', error);
      throw error;
    }
  }

  /**
   * 停止 WSS 服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          if (this.server) {
            this.server.close(() => {
              this.server = null;
              console.log('WSS server stopped');
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理客户端消息
   */
  private async handleMessage(ws: WebSocket, message: WSSMessage): Promise<void> {
    switch (message.action) {
      case 'status':
        await this.handleStatus(ws);
        break;
      case 'restart':
        await this.handleRestart(ws, message.payload);
        break;
      default:
        ws.send(JSON.stringify({
          error: `Unknown action: ${message.action}`,
        }));
    }
  }

  /**
   * 处理 status 请求
   */
  private async handleStatus(ws: WebSocket): Promise<void> {
    try {
      const processStatus = await this.processManager.getStatus();

      let certStatus = {
        cloudlinkKitInstalled: false,
        appCertInstalled: false,
      };

      if (this.sdkPath && this.appCertPath) {
        certStatus = await this.certManager.checkAllCerts(this.sdkPath, this.appCertPath);
      }

      const hostStatus = {
        entryPresent: await this.hostManager.isHostEntryPresent(),
      };

      const response: StatusResponse = {
        wssServerRunning: true,
        processStatus,
        certStatus,
        hostStatus,
      };

      ws.send(JSON.stringify(response));
    } catch (error) {
      console.error('Error getting status:', error);
      ws.send(JSON.stringify({
        error: 'Failed to get status',
      }));
    }
  }

  /**
   * 处理 restart 请求
   */
  private async handleRestart(ws: WebSocket, payload?: any): Promise<void> {
    try {
      // 如果提供了路径，更新进程路径
      if (payload?.processPath) {
        this.processManager.setProcessPath(payload.processPath);
      }

      const result = await this.processManager.restartProcess();

      ws.send(JSON.stringify({
        success: result.success,
        message: result.success ? 'Process restarted successfully' : (result.error || 'Failed to restart process'),
        error: result.error,
        exitCode: result.exitCode,
      }));
    } catch (error: any) {
      console.error('Error restarting process:', error);
      ws.send(JSON.stringify({
        success: false,
        error: error.message || 'Failed to restart process',
      }));
    }
  }

  /**
   * 检查服务器是否运行
   */
  isRunning(): boolean {
    return this.server !== null && this.wss !== null;
  }
}

