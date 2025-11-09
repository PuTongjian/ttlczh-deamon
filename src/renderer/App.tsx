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
    try {
      switch (action) {
        case 'restart':
          await window.electronAPI.restartProcess();
          break;
        case 'import-cloudlinkkit-cert':
          await window.electronAPI.importCert('cloudlinkkit');
          break;
        case 'import-app-cert':
          await window.electronAPI.importCert('app');
          break;
        case 'add-host':
          await window.electronAPI.addHostEntry();
          break;
        case 'toggle-auto-start':
          await window.electronAPI.setAutoStart(!autoStartEnabled);
          setAutoStartEnabled(!autoStartEnabled);
          break;
      }
      await refreshStatus();
    } catch (error) {
      console.error('Action failed:', error);
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

