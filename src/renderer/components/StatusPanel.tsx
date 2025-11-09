import React from 'react';
import './StatusPanel.css';

interface Status {
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

interface StatusPanelProps {
  status: Status | null;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ status }) => {
  const StatusItem: React.FC<{ label: string; value: boolean; details?: string }> = ({
    label,
    value,
    details,
  }) => (
    <div className="status-item">
      <div className="status-label">{label}</div>
      <div className="status-value">
        <span className={`status-indicator ${value ? 'status-ok' : 'status-error'}`}>
          {value ? '✓' : '✗'}
        </span>
        <span className="status-text">{value ? '正常' : '异常'}</span>
        {details && <span className="status-details">({details})</span>}
      </div>
    </div>
  );

  if (!status) {
    return (
      <div className="status-panel">
        <h2>状态信息</h2>
        <div className="status-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="status-panel">
      <h2>状态信息</h2>
      <div className="status-list">
        <StatusItem
          label="WSS 服务器 (端口 53005)"
          value={status.wssServerRunning}
        />
        <StatusItem
          label="CloudLinkKitDaemon.exe 进程"
          value={status.processStatus.isRunning}
          details={status.processStatus.pid ? `PID: ${status.processStatus.pid}` : undefined}
        />
        <StatusItem
          label="端口 7684 监听"
          value={status.processStatus.port7684Open}
        />
        <StatusItem
          label="CloudlinkKitSDK 证书"
          value={status.certStatus.cloudlinkKitInstalled}
        />
        <StatusItem
          label="应用证书"
          value={status.certStatus.appCertInstalled}
        />
        <StatusItem
          label="Host 文件修改"
          value={status.hostStatus.entryPresent}
        />
      </div>
    </div>
  );
};

export default StatusPanel;

