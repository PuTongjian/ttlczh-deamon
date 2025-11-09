import * as fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const HOST_ENTRY = '127.0.0.1 localhost.cloudec.huaweicloud.com';
const HOSTS_FILE_WIN = 'C:\\Windows\\System32\\drivers\\etc\\hosts';

export class HostManager {
  /**
   * 获取 hosts 文件路径
   */
  private getHostsPath(): string {
    if (process.platform === 'win32') {
      return HOSTS_FILE_WIN;
    } else if (process.platform === 'darwin') {
      return '/etc/hosts';
    } else {
      return '/etc/hosts';
    }
  }

  /**
   * 检测 hosts 文件中是否包含目标条目
   */
  async isHostEntryPresent(): Promise<boolean> {
    try {
      const hostsPath = this.getHostsPath();
      const content = fs.readFileSync(hostsPath, 'utf-8');

      // 检查是否包含目标条目（忽略注释和空白）
      const lines = content.split('\n').map(line => line.trim());
      return lines.some(line =>
        line === HOST_ENTRY ||
        line.includes('localhost.cloudec.huaweicloud.com')
      );
    } catch (error) {
      console.error('Error reading hosts file:', error);
      return false;
    }
  }

  /**
   * 追加 host 条目到 hosts 文件
   * 需要管理员权限
   */
  async addHostEntry(): Promise<boolean> {
    if (process.platform !== 'win32') {
      throw new Error('Host modification is currently only supported on Windows');
    }

    try {
      // 先检查是否已存在
      if (await this.isHostEntryPresent()) {
        return true;
      }

      const hostsPath = this.getHostsPath();

      // 在 Windows 上，需要管理员权限来修改 hosts 文件
      // 使用 PowerShell 来追加内容
      const command = `powershell -Command "Start-Process powershell -ArgumentList '-Command Add-Content -Path \\\"${hostsPath}\\\" -Value \\\"${HOST_ENTRY}\\\"' -Verb RunAs -Wait"`;

      await execAsync(command);

      // 等待一下，然后验证
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await this.isHostEntryPresent();
    } catch (error: any) {
      console.error('Failed to add host entry:', error);
      // 如果 PowerShell 方法失败，尝试直接写入（需要管理员权限）
      try {
        const hostsPath = this.getHostsPath();
        const content = fs.readFileSync(hostsPath, 'utf-8');

        // 检查是否已存在
        if (content.includes('localhost.cloudec.huaweicloud.com')) {
          return true;
        }

        // 追加新行
        const newContent = content + (content.endsWith('\n') ? '' : '\n') + HOST_ENTRY + '\n';
        fs.writeFileSync(hostsPath, newContent, 'utf-8');

        return await this.isHostEntryPresent();
      } catch (writeError) {
        throw new Error('Administrator privileges required to modify hosts file');
      }
    }
  }

  /**
   * 读取 hosts 文件内容（用于调试）
   */
  async readHostsFile(): Promise<string> {
    try {
      const hostsPath = this.getHostsPath();
      return fs.readFileSync(hostsPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read hosts file: ${error}`);
    }
  }
}

