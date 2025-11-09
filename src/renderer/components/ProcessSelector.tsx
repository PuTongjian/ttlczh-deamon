import React from 'react';
import './ProcessSelector.css';

interface ProcessSelectorProps {
  processPath: string;
  onProcessSelected: (path: string) => void;
}

const ProcessSelector: React.FC<ProcessSelectorProps> = ({
  processPath,
  onProcessSelected,
}) => {
  const handleSelect = async () => {
    try {
      const path = await window.electronAPI.selectProcessPath();
      if (path) {
        onProcessSelected(path);
      }
    } catch (error) {
      console.error('Failed to select process path:', error);
    }
  };

  return (
    <div className="process-selector">
      <h2>进程路径</h2>
      <div className="process-path-container">
        <input
          type="text"
          className="process-path-input"
          value={processPath || '未选择'}
          readOnly
          placeholder="请选择 CloudLinkKitDaemon.exe"
        />
        <button className="select-button" onClick={handleSelect}>
          选择进程
        </button>
      </div>
    </div>
  );
};

export default ProcessSelector;

