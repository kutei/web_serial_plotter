import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Wifi, WifiOff, Settings, Download, Trash2, Send } from 'lucide-react';
import { useSerialContext } from '../contexts/SerialContext';

const SerialTerminal = ({ onBack }) => {
  const {
    isConnected,
    status,
    error,
    connect,
    disconnect,
    sendData,
    addDataCallback,
    removeDataCallback,
    isSupported
  } = useSerialContext();

  const [terminalOutput, setTerminalOutput] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [settings, setSettings] = useState({
    baudRate: 115200,
    lineEnding: '\n',
    echo: true
  });
  const [showSettings, setShowSettings] = useState(false);

  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  // Handle incoming serial data
  useEffect(() => {
    const handleData = (data) => {
      const timestamp = new Date().toLocaleTimeString();
      setTerminalOutput(prev => [...prev, {
        type: 'received',
        data: data,
        timestamp
      }]);
    };

    addDataCallback(handleData);
    return () => removeDataCallback(handleData);
  }, [addDataCallback, removeDataCallback]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Handle disconnection (connection is handled in menu)
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Disconnection failed:', err);
    }
  };

  // Handle sending command
  const handleSendCommand = async () => {
    if (!inputValue.trim() || !isConnected) return;

    const command = inputValue.trim();
    const timestamp = new Date().toLocaleTimeString();

    // Add to terminal output
    if (settings.echo) {
      setTerminalOutput(prev => [...prev, {
        type: 'sent',
        data: command,
        timestamp
      }]);
    }

    // Add to command history
    setCommandHistory(prev => {
      const newHistory = [command, ...prev.filter(cmd => cmd !== command)];
      return newHistory.slice(0, 50); // Keep last 50 commands
    });
    setHistoryIndex(-1);

    // Send data
    try {
      await sendData(command, settings.lineEnding);
      setInputValue('');
    } catch (err) {
      setTerminalOutput(prev => [...prev, {
        type: 'error',
        data: `Error: ${err.message}`,
        timestamp
      }]);
    }
  };

  // Handle key press in input
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > -1) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(newIndex === -1 ? '' : commandHistory[newIndex] || '');
      }
    }
  };

  // Clear terminal
  const clearTerminal = () => {
    setTerminalOutput([]);
  };

  // Export log
  const exportLog = () => {
    const logContent = terminalOutput.map(entry =>
      `[${entry.timestamp}] ${entry.type.toUpperCase()}: ${entry.data}`
    ).join('\n');

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serial-log-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSupported()) {
    return (
      <div className="terminal-container">
        <div className="terminal-header">
          <button onClick={onBack} className="back-button">
            <ArrowLeft size={20} />
            戻る
          </button>
          <h2>シリアルターミナル</h2>
        </div>
        <div className="error-message">
          <p>{error || 'WebSerial APIが利用できません。'}</p>
          <p>メニュー画面で詳細な対応状況をご確認ください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={20} />
          戻る
        </button>
        <h2>シリアルターミナル</h2>
        <div className="terminal-actions">
          <button onClick={() => setShowSettings(!showSettings)} className="settings-button">
            <Settings size={20} />
          </button>
          <button onClick={exportLog} className="action-button" disabled={terminalOutput.length === 0}>
            <Download size={20} />
          </button>
          <button onClick={clearTerminal} className="action-button" disabled={terminalOutput.length === 0}>
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>設定</h3>
          <div className="setting-group">
            <label>ボーレート:</label>
            <select
              value={settings.baudRate}
              onChange={(e) => setSettings(prev => ({...prev, baudRate: parseInt(e.target.value)}))}
              disabled={isConnected}
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
              <option value={230400}>230400</option>
            </select>
          </div>
          <div className="setting-group">
            <label>改行コード:</label>
            <select
              value={settings.lineEnding}
              onChange={(e) => setSettings(prev => ({...prev, lineEnding: e.target.value}))}
            >
              <option value="\n">LF (\n)</option>
              <option value="\r">CR (\r)</option>
              <option value="\r\n">CRLF (\r\n)</option>
              <option value="">なし</option>
            </select>
          </div>
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.echo}
                onChange={(e) => setSettings(prev => ({...prev, echo: e.target.checked}))}
              />
              送信コマンドを表示
            </label>
          </div>
        </div>
      )}

        <div className="connection-panel">
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
          <span>{isConnected ? '接続中' : 'メニュー画面で接続してください'}</span>
          {status?.port && (
            <span className="port-info">
              (VID: {status.port.usbVendorId?.toString(16)}, PID: {status.port.usbProductId?.toString(16)})
            </span>
          )}
        </div>
        {isConnected && (
          <button
            onClick={handleDisconnect}
            className="connect-button disconnect"
          >
            切断
          </button>
        )}
      </div>      {error && (
        <div className="error-banner">
          <span>エラー: {error}</span>
        </div>
      )}

      <div className="terminal-output" ref={terminalRef}>
        {terminalOutput.map((entry, index) => (
          <div key={index} className={`terminal-line ${entry.type}`}>
            <span className="timestamp">[{entry.timestamp}]</span>
            <span className="type-indicator">{entry.type === 'sent' ? '→' : '←'}</span>
            <span className="data">{entry.data}</span>
          </div>
        ))}
        {terminalOutput.length === 0 && (
          <div className="empty-terminal">
            <p>ターミナル出力がここに表示されます</p>
            <p>まずシリアルポートに接続してください</p>
          </div>
        )}
      </div>

      <div className="terminal-input-panel">
        <div className="input-group">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isConnected ? "コマンドを入力... (↑↓で履歴)" : "接続してから入力してください"}
            disabled={!isConnected}
            className="terminal-input"
          />
          <button
            onClick={handleSendCommand}
            disabled={!isConnected || !inputValue.trim()}
            className="send-button"
          >
            <Send size={16} />
          </button>
        </div>
        {commandHistory.length > 0 && (
          <div className="command-history">
            履歴: {commandHistory.slice(0, 3).join(', ')}
            {commandHistory.length > 3 && '...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default SerialTerminal;
