import React from 'react';
import './ActionButtons.css';

interface ActionButtonsProps {
  loading: boolean;
  autoStartEnabled: boolean;
  onAction: (action: string) => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  loading,
  autoStartEnabled,
  onAction,
}) => {
  return (
    <div className="action-buttons">
      <h2>操作</h2>
      <div className="button-group">
        <button
          className="action-button primary"
          onClick={() => onAction('restart')}
          disabled={loading}
        >
          重启进程
        </button>
        <button
          className="action-button"
          onClick={() => onAction('import-cloudlinkkit-cert')}
          disabled={loading}
        >
          导入 CloudlinkKitSDK 证书
        </button>
        <button
          className="action-button"
          onClick={() => onAction('import-app-cert')}
          disabled={loading}
        >
          导入应用证书
        </button>
        <button
          className="action-button"
          onClick={() => onAction('add-host')}
          disabled={loading}
        >
          追加 Host 条目
        </button>
        <button
          className={`action-button ${autoStartEnabled ? 'active' : ''}`}
          onClick={() => onAction('toggle-auto-start')}
          disabled={loading}
        >
          {autoStartEnabled ? '禁用' : '启用'}开机自启动
        </button>
      </div>
    </div>
  );
};

export default ActionButtons;

