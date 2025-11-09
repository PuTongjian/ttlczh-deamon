import { spawn, exec, execFile } from 'child_process';
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
   * 诊断 DLL 依赖问题（Windows）
   */
  private async diagnoseDLLDependencies(processPath: string, processDir: string): Promise<string> {
    if (process.platform !== 'win32') {
      return '';
    }

    const diagnostics: string[] = [];
    diagnostics.push('=== DLL 依赖诊断 ===');

    // 1. 检查进程目录中的 DLL
    const missingDLLs = await this.checkCommonDLLs(processDir);
    if (missingDLLs.length > 0) {
      diagnostics.push(`\n进程目录中缺少的常见 DLL: ${missingDLLs.join(', ')}`);
    }

    // 2. 尝试使用 where 命令查找 DLL（如果系统中有）
    diagnostics.push('\n正在检查系统 PATH 中的 DLL...');
    const commonDLLs = ['vcruntime140.dll', 'msvcp140.dll', 'vcruntime140_1.dll'];
    for (const dll of commonDLLs) {
      try {
        const { stdout } = await execAsync(`where ${dll}`, { timeout: 3000 });
        if (stdout.trim()) {
          const locations = stdout.trim().split('\n').filter(line => line.trim());
          diagnostics.push(`  ✓ ${dll} 找到: ${locations.join(', ')}`);
        } else {
          diagnostics.push(`  ✗ ${dll} 未在系统 PATH 中找到`);
        }
      } catch (error) {
        diagnostics.push(`  ✗ ${dll} 未在系统 PATH 中找到`);
      }
    }

    // 3. 检查 Visual C++ 运行时库注册表项
    diagnostics.push('\n正在检查 Visual C++ 运行时库...');
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes" /s 2>nul || reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes" /s 2>nul',
        { timeout: 3000 }
      );
      if (stdout.trim()) {
        diagnostics.push('  ✓ 检测到 Visual C++ 运行时库注册表项');
      } else {
        diagnostics.push('  ✗ 未检测到 Visual C++ 运行时库注册表项');
        diagnostics.push('  建议: 安装 Microsoft Visual C++ Redistributable');
      }
    } catch (error) {
      diagnostics.push('  ⚠ 无法检查 Visual C++ 运行时库注册表（可能需要管理员权限）');
    }

    // 4. 检查 Windows 系统目录中的 DLL
    diagnostics.push('\n正在检查 Windows 系统目录...');
    const systemDirs = [
      process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : '',
      process.env.SystemRoot ? path.join(process.env.SystemRoot, 'SysWOW64') : '',
    ].filter(dir => dir);

    for (const dll of commonDLLs) {
      let found = false;
      for (const sysDir of systemDirs) {
        const dllPath = path.join(sysDir, dll);
        if (fs.existsSync(dllPath)) {
          diagnostics.push(`  ✓ ${dll} 在 ${sysDir} 中找到`);
          found = true;
          break;
        }
      }
      if (!found) {
        diagnostics.push(`  ✗ ${dll} 未在系统目录中找到`);
      }
    }

    // 5. 建议
    diagnostics.push('\n=== 建议解决方案 ===');
    diagnostics.push('1. 安装 Microsoft Visual C++ Redistributable:');
    diagnostics.push('   - VC++ 2015-2022 Redistributable (x64): https://aka.ms/vs/17/release/vc_redist.x64.exe');
    diagnostics.push('   - VC++ 2015-2022 Redistributable (x86): https://aka.ms/vs/17/release/vc_redist.x86.exe');
    diagnostics.push('2. 确保所有必需的 DLL 文件在进程目录中');
    diagnostics.push('3. 检查系统 PATH 环境变量是否包含必要的路径');
    diagnostics.push('4. 尝试以管理员权限运行程序');

    return diagnostics.join('\n');
  }

  /**
   * 尝试使用 cmd /c 启动进程（备用方法）
   */
  /**
   * 方法1: 使用 execFile 启动（最直接的方法）
   */
  private async startProcessWithExecFile(processPath: string, processDir: string): Promise<ProcessStartResult> {
    return new Promise((resolve) => {
      let isResolved = false;
      const safeResolve = (result: ProcessStartResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      console.log(`[Method 1] Using execFile to start: ${processPath}`);

      const env = {
        ...process.env,
        PATH: `${processDir}${path.delimiter}${process.env.PATH}`,
      };

      this.currentProcess = execFile(processPath, [], {
        cwd: processDir,
        env,
        windowsVerbatimArguments: false,
        shell: false,
      });

      let stderrOutput = '';
      if (this.currentProcess.stderr) {
        this.currentProcess.stderr.on('data', (data: Buffer) => {
          stderrOutput += data.toString();
        });
      }

      this.currentProcess.on('error', (error: Error) => {
        console.error(`[Method 1] execFile error: ${error.message}`);
        safeResolve({
          success: false,
          error: `execFile failed: ${error.message}\nStderr: ${stderrOutput || 'No stderr output'}`,
        });
      });

      this.currentProcess.on('exit', (code: number | null) => {
        if (code === 0) {
          setTimeout(async () => {
            const status = await this.checkProcessRunning();
            if (status.isRunning) {
              console.log(`[Method 1] Process started successfully (PID: ${status.pid})`);
              safeResolve({ success: true });
            } else {
              safeResolve({
                success: false,
                error: 'Process exited immediately with code 0',
              });
            }
          }, 2000);
        } else if (code !== null) {
          safeResolve({
            success: false,
            error: `Process exited with code ${code}\nStderr: ${stderrOutput || 'No stderr output'}`,
            exitCode: code,
          });
        }
      });

      // 超时检查
      setTimeout(() => {
        if (!isResolved) {
          const status = this.checkProcessRunning();
          status.then((s) => {
            if (s.isRunning && !isResolved) {
              console.log(`[Method 1] Process appears to be running (timeout check)`);
              safeResolve({ success: true });
            }
          });
        }
      }, 3000);
    });
  }

  /**
   * 方法2: 使用 PowerShell 设置 DLL 搜索路径并启动
   */
  private async startProcessWithPowerShell(processPath: string, processDir: string): Promise<ProcessStartResult> {
    return new Promise((resolve) => {
      let isResolved = false;
      const safeResolve = (result: ProcessStartResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      console.log(`[Method 2] Using PowerShell to start: ${processPath}`);

      // PowerShell 脚本：设置 DLL 搜索路径并启动进程
      // 转义路径中的特殊字符
      const escapedProcessDir = processDir.replace(/'/g, "''").replace(/"/g, '`"');
      const escapedProcessPath = processPath.replace(/'/g, "''").replace(/"/g, '`"');

      const psScript = `
        $env:PATH = '${escapedProcessDir};' + $env:PATH
        $env:PATH = '${escapedProcessDir}\\bin;' + $env:PATH
        $env:PATH = '${escapedProcessDir}\\lib;' + $env:PATH
        $process = Start-Process -FilePath '${escapedProcessPath}' -WorkingDirectory '${escapedProcessDir}' -PassThru -NoNewWindow
        Start-Sleep -Milliseconds 500
        if ($process.HasExited) {
          Write-Host "EXIT_CODE:$($process.ExitCode)"
          exit $process.ExitCode
        } else {
          Write-Host "SUCCESS:$($process.Id)"
          exit 0
        }
      `.trim();

      // 使用 PowerShell 执行脚本（使用单引号包装整个脚本）
      this.currentProcess = exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command '${psScript.replace(/'/g, "''")}'`, {
        cwd: processDir,
        env: {
          ...process.env,
          PATH: `${processDir}${path.delimiter}${process.env.PATH}`,
        },
        timeout: 5000,
      }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Method 2] PowerShell error: ${error.message}`);
          safeResolve({
            success: false,
            error: `PowerShell failed: ${error.message}\nStdout: ${stdout || 'No stdout'}\nStderr: ${stderr || 'No stderr'}`,
            exitCode: error.code || undefined,
          });
        } else {
          // 检查输出
          if (stdout.includes('SUCCESS:')) {
            const match = stdout.match(/SUCCESS:(\d+)/);
            if (match) {
              console.log(`[Method 2] Process started successfully (PID: ${match[1]})`);
              safeResolve({ success: true });
            } else {
              safeResolve({ success: true });
            }
          } else if (stdout.includes('EXIT_CODE:')) {
            const match = stdout.match(/EXIT_CODE:(\d+)/);
            const exitCode = match ? parseInt(match[1], 10) : undefined;
            safeResolve({
              success: false,
              error: `Process exited immediately\nStdout: ${stdout}\nStderr: ${stderr || 'No stderr'}`,
              exitCode,
            });
          } else {
            // 等待一下检查进程是否在运行
            setTimeout(async () => {
              const status = await this.checkProcessRunning();
              if (status.isRunning) {
                console.log(`[Method 2] Process started successfully (PID: ${status.pid})`);
                safeResolve({ success: true });
              } else {
                safeResolve({
                  success: false,
                  error: `Process may have failed\nStdout: ${stdout}\nStderr: ${stderr || 'No stderr'}`,
                });
              }
            }, 2000);
          }
        }
      });
    });
  }

  /**
   * 方法3: 使用批处理脚本启动
   */
  private async startProcessWithBatch(processPath: string, processDir: string): Promise<ProcessStartResult> {
    return new Promise(async (resolve) => {
      let isResolved = false;
      const safeResolve = (result: ProcessStartResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      console.log(`[Method 3] Using batch script to start: ${processPath}`);

      try {
        // 创建临时批处理脚本
        const batchFile = path.join(processDir, 'start_daemon_temp.bat');
        const batchContent = `@echo off
cd /d "${processDir}"
set PATH=${processDir};%PATH%
set PATH=${processDir}\\bin;%PATH%
set PATH=${processDir}\\lib;%PATH%
start "" "${processPath}"
exit /b 0
`;

        await fs.promises.writeFile(batchFile, batchContent, 'utf8');

        // 执行批处理脚本
        this.currentProcess = exec(`cmd /c "${batchFile}"`, {
          cwd: processDir,
          env: {
            ...process.env,
            PATH: `${processDir}${path.delimiter}${process.env.PATH}`,
          },
          timeout: 5000,
        }, async (error, stdout, stderr) => {
          // 清理临时文件
          try {
            await fs.promises.unlink(batchFile);
          } catch (e) {
            // 忽略清理错误
          }

          if (error) {
            console.error(`[Method 3] Batch script error: ${error.message}`);
            safeResolve({
              success: false,
              error: `Batch script failed: ${error.message}\nStderr: ${stderr || 'No stderr'}`,
              exitCode: error.code || undefined,
            });
          } else {
            // 等待一下检查进程是否在运行
            setTimeout(async () => {
              const status = await this.checkProcessRunning();
              if (status.isRunning) {
                console.log(`[Method 3] Process started successfully (PID: ${status.pid})`);
                safeResolve({ success: true });
              } else {
                safeResolve({
                  success: false,
                  error: `Process may have failed\nStdout: ${stdout}\nStderr: ${stderr || 'No stderr'}`,
                });
              }
            }, 2000);
          }
        });
      } catch (error: any) {
        safeResolve({
          success: false,
          error: `Failed to create batch script: ${error.message}`,
        });
      }
    });
  }

  /**
   * 方法4: 使用 start 命令启动（Windows）
   */
  private async startProcessWithStart(processPath: string, processDir: string): Promise<ProcessStartResult> {
    return new Promise((resolve) => {
      let isResolved = false;
      const safeResolve = (result: ProcessStartResult) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      console.log(`[Method 4] Using start command: ${processPath}`);

      // 使用 start 命令启动进程
      const cmd = `start "" /D "${processDir}" "${processPath}"`;
      this.currentProcess = exec(cmd, {
        cwd: processDir,
        env: {
          ...process.env,
          PATH: `${processDir}${path.delimiter}${process.env.PATH}`,
        },
        timeout: 5000,
      }, async (error, stdout, stderr) => {
        if (error) {
          console.error(`[Method 4] Start command error: ${error.message}`);
          safeResolve({
            success: false,
            error: `Start command failed: ${error.message}\nStderr: ${stderr || 'No stderr'}`,
            exitCode: error.code || undefined,
          });
        } else {
          // 等待一下检查进程是否在运行
          setTimeout(async () => {
            const status = await this.checkProcessRunning();
            if (status.isRunning) {
              console.log(`[Method 4] Process started successfully (PID: ${status.pid})`);
              safeResolve({ success: true });
            } else {
              safeResolve({
                success: false,
                error: `Process may have failed\nStdout: ${stdout}\nStderr: ${stderr || 'No stderr'}`,
              });
            }
          }, 2000);
        }
      });
    });
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

      // 按顺序尝试不同的启动方法
      const methods = [
        { name: 'execFile', fn: () => this.startProcessWithExecFile(this.processPath, processDir) },
        { name: 'PowerShell', fn: () => this.startProcessWithPowerShell(this.processPath, processDir) },
        { name: 'Batch Script', fn: () => this.startProcessWithBatch(this.processPath, processDir) },
        { name: 'Start Command', fn: () => this.startProcessWithStart(this.processPath, processDir) },
      ];

      const errors: string[] = [];

      for (const method of methods) {
        console.log(`\n=== Trying method: ${method.name} ===`);
        try {
          const result = await method.fn();
          if (result.success) {
            console.log(`✓ Method ${method.name} succeeded!`);
            return result;
          } else {
            const errorMsg = `Method ${method.name} failed: ${result.error || 'Unknown error'}`;
            console.error(`✗ ${errorMsg}`);
            errors.push(errorMsg);

            // 如果是 DLL 错误，运行诊断
            if (result.exitCode === 0xC0000135 && process.platform === 'win32') {
              console.log(`Running DLL dependency diagnosis for ${method.name}...`);
              try {
                const dllDiagnostics = await this.diagnoseDLLDependencies(this.processPath, processDir);
                if (dllDiagnostics) {
                  errors.push(`\nDLL Diagnosis:\n${dllDiagnostics}`);
                }
              } catch (diagError: any) {
                console.error(`Failed to run DLL diagnosis: ${diagError.message}`);
              }
            }
          }
        } catch (error: any) {
          const errorMsg = `Method ${method.name} threw error: ${error.message}`;
          console.error(`✗ ${errorMsg}`);
          errors.push(errorMsg);
        }

        // 在尝试下一个方法之前等待一下
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 所有方法都失败了
      const allErrors = errors.join('\n\n');
      console.error('\n=== All startup methods failed ===');
      return {
        success: false,
        error: `All startup methods failed:\n\n${allErrors}`,
      };
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


