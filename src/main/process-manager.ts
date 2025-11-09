import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ProcessStatus {
  isRunning: boolean;
  pid?: number;
  port7684Open: boolean;
}

export interface ProcessStartResult {
  success: boolean;
  error?: string;
  exitCode?: number;
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
   * 诊断 Windows 错误码
   */
  private getWindowsErrorDescription(code: number): string {
    // 将退出码转换为十六进制
    const hexCode = `0x${code.toString(16).toUpperCase()}`;

    // 常见的 Windows 错误码
    const errorCodes: { [key: number]: string } = {
      0xC0000135: 'STATUS_DLL_NOT_FOUND - 无法找到所需的 DLL 文件。请检查：\n' +
        '  1. 确保 CloudLinkKitDaemon.exe 所在目录包含所有必需的 DLL 文件\n' +
        '  2. 检查是否缺少 Visual C++ 运行库（VC++ Redistributable）\n' +
        '  3. 尝试以管理员权限运行程序\n' +
        '  4. 检查系统 PATH 环境变量是否包含必要的路径',
      0xC0000142: 'STATUS_DLL_INIT_FAILED - DLL 初始化失败',
      0xC0000017: 'STATUS_NO_MEMORY - 内存不足',
      0xC0000005: 'STATUS_ACCESS_VIOLATION - 访问违规',
    };

    const description = errorCodes[code];
    if (description) {
      return `${hexCode}: ${description}`;
    }
    return `${hexCode}: 未知错误 (退出码: ${code})`;
  }

  /**
   * 检查文件是否存在和可访问
   */
  private async checkFileAccessibility(filePath: string): Promise<{ accessible: boolean; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { accessible: false, error: '文件不存在' };
      }

      // 检查文件权限
      try {
        fs.accessSync(filePath, fs.constants.F_OK | fs.constants.R_OK);
      } catch (err: any) {
        return { accessible: false, error: `文件权限不足: ${err.message}` };
      }

      // 检查是否是文件（不是目录）
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { accessible: false, error: '路径不是文件' };
      }

      return { accessible: true };
    } catch (error: any) {
      return { accessible: false, error: error.message };
    }
  }

  /**
   * 检查进程目录中的常见 DLL 文件
   */
  private async checkCommonDLLs(processDir: string): Promise<string[]> {
    const commonDLLs = [
      'msvcr120.dll',
      'msvcp120.dll',
      'vcruntime140.dll',
      'msvcp140.dll',
      'vcruntime140_1.dll',
      'api-ms-win-crt-runtime-l1-1-0.dll',
    ];

    const missingDLLs: string[] = [];
    for (const dll of commonDLLs) {
      const dllPath = path.join(processDir, dll);
      if (!fs.existsSync(dllPath)) {
        missingDLLs.push(dll);
      }
    }

    return missingDLLs;
  }

  /**
   * 启动进程
   */
  async startProcess(): Promise<ProcessStartResult> {
    if (!this.processPath) {
      return {
        success: false,
        error: 'Process path not set',
      };
    }

    try {
      // 先检查是否已经在运行
      const status = await this.checkProcessRunning();
      if (status.isRunning) {
        console.log(`Process is already running (PID: ${status.pid})`);
        return { success: true };
      }

      console.log(`[1] Starting process: ${this.processPath}`);

      // 检查文件可访问性
      const fileCheck = await this.checkFileAccessibility(this.processPath);
      if (!fileCheck.accessible) {
        const errorMsg = `File accessibility check failed: ${fileCheck.error}`;
        console.error(`[1] ${errorMsg}`);
        console.error(`[1] Process path: ${this.processPath}`);
        return {
          success: false,
          error: errorMsg,
        };
      }

      // 获取进程目录
      const processDir = path.dirname(this.processPath);
      console.log(`[1] Working directory: ${processDir}`);

      // 检查常见 DLL 文件（仅 Windows）
      if (process.platform === 'win32') {
        const missingDLLs = await this.checkCommonDLLs(processDir);
        if (missingDLLs.length > 0) {
          console.warn(`[1] Warning: Some common DLLs not found in process directory: ${missingDLLs.join(', ')}`);
          console.warn('[1] This may not be an error if DLLs are in system PATH or Windows directory');
        }
      }

      // 使用 Promise 来等待进程启动结果
      return new Promise((resolve) => {
        // 收集stderr输出
        let stderrOutput = '';
        let exitCode: number | null = null;
        let hasExited = false;
        let isResolved = false; // 防止重复 resolve
        let errorMessage = '';

        const safeResolve = (result: ProcessStartResult) => {
          if (!isResolved) {
            isResolved = true;
            resolve(result);
          }
        };

        // 启动进程，捕获stderr用于错误日志
        this.currentProcess = spawn(this.processPath, [], {
          detached: false, // 改为 false，以便更好地捕获错误
          stdio: ['ignore', 'ignore', 'pipe'], // 只捕获stderr用于错误日志
          cwd: processDir,
          env: {
            ...process.env,
            PATH: `${processDir}${path.delimiter}${process.env.PATH}`, // 将进程目录添加到 PATH
          },
        });

        // 收集stderr输出
        if (this.currentProcess.stderr) {
          this.currentProcess.stderr.on('data', (data: Buffer) => {
            stderrOutput += data.toString();
          });
        }

        // 捕获spawn错误事件
        this.currentProcess.on('error', (error: Error) => {
          const errorMsg = `Failed to spawn process: ${error.message}`;
          console.error(`[1] ${errorMsg}`);
          console.error(`[1] Process path: ${this.processPath}`);
          console.error(`[1] Working directory: ${processDir}`);
          if (stderrOutput) {
            console.error(`[1] Stderr output: ${stderrOutput}`);
          }
          hasExited = true;
          errorMessage = errorMsg;
          safeResolve({
            success: false,
            error: errorMessage,
          });
        });

        // 监听进程退出事件（如果进程立即退出）
        this.currentProcess.on('exit', (code: number | null, signal: string | null) => {
          exitCode = code;
          hasExited = true;

          if (code !== null && code !== 0) {
            console.error(`[1] Process exited immediately with code ${code}`);
            if (signal) {
              console.error(`[1] Exit signal: ${signal}`);
            }

            // 诊断 Windows 错误码
            let errorDesc = '';
            if (process.platform === 'win32' && code > 0x80000000) {
              errorDesc = this.getWindowsErrorDescription(code);
              console.error(`[1] Error description: ${errorDesc}`);
            }

            if (stderrOutput) {
              console.error(`[1] Stderr output: ${stderrOutput}`);
            } else {
              console.error(`[1] Stderr: No stderr output`);
            }

            // 构建错误消息
            errorMessage = `Process exited immediately with code ${code}`;
            if (errorDesc) {
              errorMessage += `\n${errorDesc}`;
            }
            if (stderrOutput) {
              errorMessage += `\nStderr: ${stderrOutput}`;
            } else {
              errorMessage += '\nStderr: No stderr output';
            }

            // 如果进程立即退出，立即返回失败
            safeResolve({
              success: false,
              error: errorMessage,
              exitCode: code,
            });
          }
        });

        // 等待一段时间检查进程是否还在运行
        setTimeout(async () => {
          if (isResolved) {
            return;
          }

          if (hasExited) {
            if (exitCode !== null && exitCode !== 0) {
              // 已经在 exit 事件中处理了
              return;
            }
            safeResolve({
              success: false,
              error: 'Process failed to start. Stderr: ' + (stderrOutput || 'No stderr output'),
              exitCode: exitCode || undefined,
            });
            return;
          }

          const newStatus = await this.checkProcessRunning();
          if (newStatus.isRunning) {
            console.log(`[1] Process started successfully (PID: ${newStatus.pid})`);
            // 如果进程成功启动，将其分离
            if (this.currentProcess) {
              this.currentProcess.unref();
            }
            safeResolve({ success: true });
          } else {
            // 如果进程没有运行，但也没有立即退出，可能是启动失败
            const errorMsg = exitCode === null
              ? `Process failed to start. Stderr: ${stderrOutput || 'No stderr output'}`
              : `Process exited with code ${exitCode}`;
            console.error(`[1] ${errorMsg}`);
            safeResolve({
              success: false,
              error: errorMsg,
              exitCode: exitCode || undefined,
            });
          }
        }, 2000); // 等待 2 秒检查进程状态
      });
    } catch (error: any) {
      const errorMsg = `Failed to start process: ${error.message}`;
      console.error(`[1] ${errorMsg}`);
      console.error(`[1] Process path: ${this.processPath}`);
      console.error(`[1] Error message: ${error.message}`);
      if (error.stack) {
        console.error(`[1] Stack trace: ${error.stack}`);
      }
      return {
        success: false,
        error: errorMsg,
      };
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
  async restartProcess(): Promise<ProcessStartResult> {
    await this.stopProcess();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startProcess();
  }
}


