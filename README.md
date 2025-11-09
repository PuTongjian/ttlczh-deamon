# Electron WSS Daemon Manager

一个用于管理 CloudLinkKitDaemon.exe 进程的 Electron 应用程序，提供本地 WSS 服务、进程管理、证书导入和 hosts 文件管理功能。

## 功能特性

- **WSS 服务器**: 在本地端口 53005 提供安全的 WebSocket 服务
- **进程管理**: 检测和管理 CloudLinkKitDaemon.exe 进程
- **证书管理**: 一键导入 CloudlinkKitSDK 证书和应用证书到受信任的根证书颁发机构
- **Hosts 管理**: 自动追加 hosts 条目
- **开机自启动**: 支持设置应用开机自启动
- **Windows 安装包**: 自动化的安装流程，包括证书导入、hosts 修改和自启动设置

## 开发环境设置

### 前置要求

- Node.js 18+ 
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 生成证书

在开发或构建之前，需要先生成应用证书：

```bash
npm run generate-cert
```

这将在 `resources/app-cert/` 目录下生成：
- `root.crt` - 根证书
- `root.key` - 根证书私钥
- `server.crt` - 服务器证书
- `server.key` - 服务器私钥

### 开发模式

启动开发服务器：

```bash
npm run dev
```

这将同时启动：
- Vite 开发服务器（渲染进程）
- Electron 应用（主进程）

### 构建

构建应用：

```bash
npm run build
```

构建 Windows 安装包：

```bash
npm run dist:win
```

安装包将输出到 `dist-electron/` 目录。

## 项目结构

```
ttlczh-deamon-temp/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 主进程入口
│   │   ├── wss-server.ts  # WSS 服务器
│   │   ├── process-manager.ts
│   │   ├── cert-manager.ts
│   │   ├── host-manager.ts
│   │   └── auto-start.ts
│   ├── renderer/          # React UI
│   │   ├── components/
│   │   └── styles/
│   ├── scripts/
│   │   └── generate-cert.js
│   └── preload.ts         # Preload 脚本
├── resources/
│   └── app-cert/          # 应用证书（生成后）
├── build/
│   ├── installer.nsh      # NSIS 安装脚本
│   └── app.manifest        # 应用程序清单
└── CloudlinkKitSDK.zip    # SDK 资源文件
```

## WSS API

应用在 `wss://127.0.0.1:53005` 提供 WebSocket 服务。

### 消息格式

```json
{
  "action": "status" | "restart",
  "payload": {}
}
```

### Status 请求

```json
{
  "action": "status"
}
```

响应：

```json
{
  "wssServerRunning": true,
  "processStatus": {
    "isRunning": true,
    "pid": 12345,
    "port7684Open": true
  },
  "certStatus": {
    "cloudlinkKitInstalled": true,
    "appCertInstalled": true
  },
  "hostStatus": {
    "entryPresent": true
  }
}
```

### Restart 请求

```json
{
  "action": "restart",
  "payload": {
    "processPath": "C:\\path\\to\\CloudLinkKitDaemon.exe"
  }
}
```

响应：

```json
{
  "success": true,
  "message": "Process restarted successfully"
}
```

## Windows 安装包

安装包在安装时会自动执行以下操作：

1. **解压 CloudlinkKitSDK.zip** 到安装目录
2. **导入证书** 到受信任的根证书颁发机构（需要管理员权限）
   - CloudlinkKitSDK/root.crt
   - 应用证书 root.crt
3. **修改 hosts 文件**（需要管理员权限）
   - 追加 `127.0.0.1 localhost.cloudec.huaweicloud.com`
4. **设置开机自启动**
5. **设置应用以管理员权限运行**（通过应用程序清单）

## 注意事项

1. **管理员权限**: 证书导入、hosts 修改和某些系统操作需要管理员权限。应用已配置为以管理员权限运行。

2. **证书生成**: 首次运行前必须执行 `npm run generate-cert` 生成证书。

3. **CloudlinkKitSDK.zip**: 确保 `CloudlinkKitSDK.zip` 文件存在于项目根目录，它将被包含在安装包中。

4. **端口占用**: 确保端口 53005 和 7684 未被其他应用占用。

## 许可证

MIT

