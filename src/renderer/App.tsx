import React, { useState, useEffect } from 'react';
import StatusPanel from './components/StatusPanel';
import ProcessSelector from './components/ProcessSelector';
import ActionButtons from './components/ActionButtons';
import './styles/App.css';

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

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [processPath, setProcessPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = async () => {
    try {
      const result = await window.electronAPI.getStatus();
      if (result && !result.error) {
        setStatus(result);
      }
    } catch (error) {
      console.error('Failed to get status:', error);
    }
  };

  const checkAutoStart = async () => {
    try {
      const result = await window.electronAPI.checkAutoStart();
      if (result) {
        setAutoStartEnabled(result.enabled);
      }
    } catch (error) {
      console.error('Failed to check auto-start:', error);
    }
  };

  useEffect(() => {
    refreshStatus();
    checkAutoStart();
    const interval = setInterval(refreshStatus, 3000); // 每3秒刷新一次
    return () => clearInterval(interval);
  }, []);

  const handleProcessSelected = (path: string) => {
    setProcessPath(path);
    refreshStatus();
  };

  const handleAction = async (action: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      let result: any;
      switch (action) {
        case 'restart':
          result = await window.electronAPI.restartProcess();
          if (!result.success) {
            setErrorMessage(result.error || '重启进程失败');
          }
          break;
        case 'import-cloudlinkkit-cert':
          result = await window.electronAPI.importCert('cloudlinkkit');
          if (!result.success) {
            setErrorMessage(result.error || '导入证书失败');
          }
          break;
        case 'import-app-cert':
          result = await window.electronAPI.importCert('app');
          if (!result.success) {
            setErrorMessage(result.error || '导入证书失败');
          }
          break;
        case 'add-host':
          result = await window.electronAPI.addHostEntry();
          if (!result.success) {
            setErrorMessage(result.error || '添加 Host 条目失败');
          }
          break;
        case 'toggle-auto-start':
          result = await window.electronAPI.setAutoStart(!autoStartEnabled);
          if (!result.success) {
            setErrorMessage(result.error || '设置自启动失败');
          } else {
            setAutoStartEnabled(!autoStartEnabled);
          }
          break;
      }
      await refreshStatus();
    } catch (error: any) {
      console.error('Action failed:', error);
      setErrorMessage(error.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>WSS Daemon Manager</h1>
      </header>
      <main className="app-main">
        {errorMessage && (
          <div className="error-message" onClick={() => setErrorMessage(null)}>
            <div className="error-content">
              <strong>错误：</strong>
              <pre>{errorMessage}</pre>
              <button className="error-close" onClick={(e) => { e.stopPropagation(); setErrorMessage(null); }}>×</button>
            </div>
          </div>
        )}
        <ProcessSelector
          processPath={processPath}
          onProcessSelected={handleProcessSelected}
        />
        <StatusPanel status={status} />
        <ActionButtons
          loading={loading}
          autoStartEnabled={autoStartEnabled}
          onAction={handleAction}
        />
      </main>
    </div>
  );
}

export default App;

