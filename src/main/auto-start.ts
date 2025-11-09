import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class AutoStartManager {
  private appName = 'WSS Daemon Manager';
  private regKey = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

  /**
   * 检测是否已设置开机自启动
   */
  async isAutoStartEnabled(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      const { stdout } = await execAsync(
        `reg query "${this.regKey}" /v "${this.appName}"`
      );
      return stdout.includes(this.appName);
    } catch (error) {
      return false;
    }
  }

  /**
   * 设置开机自启动
   */
  async enableAutoStart(appPath: string): Promise<boolean> {
    if (process.platform !== 'win32') {
      throw new Error('Auto-start is only supported on Windows');
    }

    if (!fs.existsSync(appPath)) {
      throw new Error(`Application path not found: ${appPath}`);
    }

    try {
      // 使用 reg add 命令添加注册表项
      // /t REG_SZ 表示字符串类型
      // /d 指定值（应用路径）
      // /f 强制覆盖已存在的项
      await execAsync(
        `reg add "${this.regKey}" /v "${this.appName}" /t REG_SZ /d "${appPath}" /f`
      );

      // 验证是否设置成功
      await new Promise(resolve => setTimeout(resolve, 500));
      return await this.isAutoStartEnabled();
    } catch (error: any) {
      console.error('Failed to enable auto-start:', error);
      throw new Error(`Failed to set auto-start: ${error.message}`);
    }
  }

  /**
   * 禁用开机自启动
   */
  async disableAutoStart(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      await execAsync(
        `reg delete "${this.regKey}" /v "${this.appName}" /f`
      );

      await new Promise(resolve => setTimeout(resolve, 500));
      return !(await this.isAutoStartEnabled());
    } catch (error) {
      console.error('Failed to disable auto-start:', error);
      return false;
    }
  }

  /**
   * 获取当前自启动路径
   */
  async getAutoStartPath(): Promise<string | null> {
    if (process.platform !== 'win32') {
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `reg query "${this.regKey}" /v "${this.appName}"`
      );

      const match = stdout.match(/REG_SZ\s+(.+)/);
      return match ? match[1].trim() : null;
    } catch (error) {
      return null;
    }
  }
}

