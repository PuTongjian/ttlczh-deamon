import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export class CertManager {
  /**
   * 检测证书是否已导入到 Windows 受信任的根证书颁发机构
   */
  async isCertInstalled(certPath: string): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      // 读取证书的指纹
      const { stdout } = await execAsync(`certutil -dump "${certPath}"`);
      const thumbprintMatch = stdout.match(/Cert Hash\(sha1\): ([A-F0-9\s]+)/i);

      if (!thumbprintMatch) {
        return false;
      }

      const thumbprint = thumbprintMatch[1].replace(/\s/g, '').toUpperCase();

      // 检查证书是否在受信任的根证书颁发机构中
      const { stdout: listOutput } = await execAsync(
        'certutil -store -enterprise Root'
      );

      return listOutput.includes(thumbprint);
    } catch (error) {
      console.error('Error checking certificate:', error);
      return false;
    }
  }

  /**
   * 导入证书到 Windows 受信任的根证书颁发机构
   * 需要管理员权限
   */
  async installCert(certPath: string): Promise<boolean> {
    if (process.platform !== 'win32') {
      throw new Error('Certificate installation is only supported on Windows');
    }

    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }

    try {
      // 使用 certutil 导入证书到受信任的根证书颁发机构
      // -addstore Root 表示添加到根证书存储区
      const { stdout, stderr } = await execAsync(
        `certutil -addstore -f Root "${certPath}"`,
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );

      console.log('Certificate installation output:', stdout);
      if (stderr && !stderr.includes('成功')) {
        console.error('Certificate installation stderr:', stderr);
      }

      // 验证是否安装成功
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await this.isCertInstalled(certPath);
    } catch (error: any) {
      console.error('Failed to install certificate:', error);
      // 检查是否是权限问题
      if (error.message && error.message.includes('拒绝访问')) {
        throw new Error('Administrator privileges required to install certificate');
      }
      throw error;
    }
  }

  /**
   * 导入 CloudlinkKitSDK/root.crt
   */
  async installCloudlinkKitCert(sdkPath: string): Promise<boolean> {
    const certPath = path.join(sdkPath, 'root.crt');
    if (!fs.existsSync(certPath)) {
      throw new Error(`CloudlinkKitSDK certificate not found: ${certPath}`);
    }
    return await this.installCert(certPath);
  }

  /**
   * 导入应用自己的证书
   */
  async installAppCert(appCertPath: string): Promise<boolean> {
    const certPath = path.join(appCertPath, 'root.crt');
    if (!fs.existsSync(certPath)) {
      throw new Error(`App certificate not found: ${certPath}`);
    }
    return await this.installCert(certPath);
  }

  /**
   * 检查所有需要的证书是否已安装
   */
  async checkAllCerts(sdkPath: string, appCertPath: string): Promise<{
    cloudlinkKitInstalled: boolean;
    appCertInstalled: boolean;
  }> {
    const cloudlinkKitCert = path.join(sdkPath, 'root.crt');
    const appCert = path.join(appCertPath, 'root.crt');

    const cloudlinkKitInstalled = fs.existsSync(cloudlinkKitCert)
      ? await this.isCertInstalled(cloudlinkKitCert)
      : false;

    const appCertInstalled = fs.existsSync(appCert)
      ? await this.isCertInstalled(appCert)
      : false;

    return {
      cloudlinkKitInstalled,
      appCertInstalled,
    };
  }
}

