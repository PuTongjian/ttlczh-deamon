import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';

const execAsync = promisify(exec);

export interface ProcessStatus {
  isRunning: boolean;
  pid?: number;
  port7684Open: boolean;
}

export class ProcessManager {
  private processPath: string = '';
  private currentProcess: any = null;

  setProcessPath(path: string) {
    this.processPath = path;
  }

  getProcessPath(): string {
    return this.processPath;
  }

  /**
   * 检测 CloudLinkKitDaemon.exe 进程是否运行
   */
  async checkProcessRunning(): Promise<{ isRunning: boolean; pid?: number }> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq CloudLinkKitDaemon.exe" /FO CSV /NH');
        const lines = stdout.trim().split('\n').filter(line => line.includes('CloudLinkKitDaemon.exe'));

        if (lines.length > 0) {
          // 解析 PID (CSV 格式: "进程名","PID","会话名","会话#","内存使用")
          const match = lines[0].match(/"CloudLinkKitDaemon\.exe","(\d+)"/);
          if (match) {
            return { isRunning: true, pid: parseInt(match[1], 10) };
          }
        }
      } else {
        // macOS/Linux 使用 ps
        const { stdout } = await execAsync('ps aux | grep CloudLinkKitDaemon.exe | grep -v grep');
        if (stdout.trim()) {
          const match = stdout.match(/\s+(\d+)\s+/);
          if (match) {
            return { isRunning: true, pid: parseInt(match[1], 10) };
          }
        }
      }
      return { isRunning: false };
    } catch (error) {
      return { isRunning: false };
    }
  }

  /**
   * 检测端口 7684 是否被监听
   */
  async checkPort7684(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000;

      socket.setTimeout(timeout);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        resolve(false);
      });

      socket.connect(7684, '127.0.0.1');
    });
  }

  /**
   * 获取完整状态
   */
  async getStatus(): Promise<ProcessStatus> {
    const processStatus = await this.checkProcessRunning();
    const port7684Open = await this.checkPort7684();

    return {
      isRunning: processStatus.isRunning,
      pid: processStatus.pid,
      port7684Open,
    };
  }

  /**
   * 启动进程
   */
  async startProcess(): Promise<boolean> {
    if (!this.processPath) {
      throw new Error('Process path not set');
    }

    try {
      // 先检查是否已经在运行
      const status = await this.checkProcessRunning();
      if (status.isRunning) {
        console.log(`Process is already running (PID: ${status.pid})`);
        return true;
      }

      console.log(`Starting process: ${this.processPath}`);

      // 启动进程，捕获stderr用于错误日志
      const processDir = require('path').dirname(this.processPath);
      this.currentProcess = spawn(this.processPath, [], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'], // 只捕获stderr用于错误日志
        cwd: processDir,
      });

      // 收集stderr输出
      let stderrOutput = '';
      if (this.currentProcess.stderr) {
        this.currentProcess.stderr.on('data', (data: Buffer) => {
          stderrOutput += data.toString();
        });
      }

      // 捕获spawn错误事件
      this.currentProcess.on('error', (error: Error) => {
        console.error(`Failed to spawn process: ${error.message}`);
        console.error(`Process path: ${this.processPath}`);
        console.error(`Working directory: ${processDir}`);
        if (stderrOutput) {
          console.error(`Stderr output: ${stderrOutput}`);
        }
      });

      // 监听进程退出事件（如果进程立即退出）
      this.currentProcess.on('exit', (code: number | null, signal: string | null) => {
        if (code !== null) {
          console.error(`Process exited immediately with code ${code}`);
          if (signal) {
            console.error(`Exit signal: ${signal}`);
          }
          if (stderrOutput) {
            console.error(`Stderr output: ${stderrOutput}`);
          }
        }
      });

      this.currentProcess.unref();

      // 等待一下，检查是否成功启动
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newStatus = await this.checkProcessRunning();

      if (newStatus.isRunning) {
        console.log(`Process started successfully (PID: ${newStatus.pid})`);
      } else {
        console.error(`Process failed to start. Stderr: ${stderrOutput || 'No stderr output'}`);
      }

      return newStatus.isRunning;
    } catch (error: any) {
      console.error('Failed to start process:', error);
      console.error(`Process path: ${this.processPath}`);
      console.error(`Error message: ${error.message}`);
      if (error.stack) {
        console.error(`Stack trace: ${error.stack}`);
      }
      return false;
    }
  }

  /**
   * 停止进程
   */
  async stopProcess(): Promise<boolean> {
    try {
      const status = await this.checkProcessRunning();
      if (!status.isRunning) {
        return true;
      }

      if (process.platform === 'win32') {
        if (status.pid) {
          await execAsync(`taskkill /F /PID ${status.pid}`);
        } else {
          await execAsync('taskkill /F /IM CloudLinkKitDaemon.exe');
        }
      } else {
        if (status.pid) {
          await execAsync(`kill -9 ${status.pid}`);
        } else {
          await execAsync('pkill -9 CloudLinkKitDaemon.exe');
        }
      }

      // 等待一下，确认进程已停止
      await new Promise(resolve => setTimeout(resolve, 500));
      const newStatus = await this.checkProcessRunning();
      return !newStatus.isRunning;
    } catch (error) {
      console.error('Failed to stop process:', error);
      return false;
    }
  }

  /**
   * 重启进程
   */
  async restartProcess(): Promise<boolean> {
    await this.stopProcess();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startProcess();
  }
}

