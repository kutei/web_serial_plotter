import React, { useState } from 'react';
import { Terminal, BarChart3, Wifi, WifiOff, Settings, Plug, PlugZap } from 'lucide-react';
import { WebSerialSupport } from '../utils/webSerialSupport';
import { useSerialContext } from '../contexts/SerialContext';

const MenuScreen = ({ onSelectFeature }) => {
  const isWebSerialSupported = WebSerialSupport.isSupported();
  const supportInfo = WebSerialSupport.getSupportInfo();

  const {
    isConnected,
    status,
    error,
    connect,
    disconnect
  } = useSerialContext();

  const [showSettings, setShowSettings] = useState(false);
  const [connectionSettings, setConnectionSettings] = useState({
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none'
  });

  // Handle connection
  const handleConnect = async () => {
    try {
      await connect(connectionSettings);
    } catch (err) {
      console.error('Connection failed:', err);
    }
  };

  // Handle disconnection
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Disconnection failed:', err);
    }
  };

  const features = [
    {
      id: 'terminal',
      title: 'シリアルターミナル',
      description: 'シリアル通信をターミナルのように実行',
      icon: Terminal,
      color: '#4ade80'
    },
    {
      id: 'plotter',
      title: 'PIDグラフプロッター',
      description: '1軸PID制御結果をリアルタイムでグラフ表示',
      icon: BarChart3,
      color: '#60a5fa'
    }
  ];

  return (
    <div className="menu-screen">
      <div className="menu-header">
        <h2>機能選択</h2>
        <div className="header-controls">
          <div className={`webserial-status ${isWebSerialSupported ? 'supported' : 'not-supported'}`}>
            {isWebSerialSupported ? (
              <>
                <Wifi size={20} />
                <span>WebSerial API 対応</span>
              </>
            ) : (
              <>
                <WifiOff size={20} />
                <span>WebSerial API 非対応</span>
              </>
            )}
          </div>
          {isWebSerialSupported && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="settings-button"
              title="シリアル通信設定"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>

      {!isWebSerialSupported && (
        <div className="warning-message">
          <p>⚠️ {WebSerialSupport.getUnsupportedMessage()}</p>
          <div className="support-details">
            <p>詳細情報:</p>
            <ul>
              <li>Navigator API: {supportInfo.hasNavigator ? '✓' : '✗'}</li>
              <li>Serial API: {supportInfo.hasSerial ? '✓' : '✗'}</li>
              <li>Request Port: {supportInfo.hasRequestPort ? '✓' : '✗'}</li>
              <li>HTTPS: {supportInfo.isHttps ? '✓' : '✗'}</li>
            </ul>
          </div>
        </div>
      )}

      {isWebSerialSupported && showSettings && (
        <div className="menu-settings-panel">
          <h3>シリアル通信設定</h3>
          <div className="settings-grid">
            <div className="setting-group">
              <label>ボーレート:</label>
              <select
                value={connectionSettings.baudRate}
                onChange={(e) => setConnectionSettings(prev => ({...prev, baudRate: parseInt(e.target.value)}))}
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
              <label>データビット:</label>
              <select
                value={connectionSettings.dataBits}
                onChange={(e) => setConnectionSettings(prev => ({...prev, dataBits: parseInt(e.target.value)}))}
                disabled={isConnected}
              >
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>
            <div className="setting-group">
              <label>ストップビット:</label>
              <select
                value={connectionSettings.stopBits}
                onChange={(e) => setConnectionSettings(prev => ({...prev, stopBits: parseInt(e.target.value)}))}
                disabled={isConnected}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            <div className="setting-group">
              <label>パリティ:</label>
              <select
                value={connectionSettings.parity}
                onChange={(e) => setConnectionSettings(prev => ({...prev, parity: e.target.value}))}
                disabled={isConnected}
              >
                <option value="none">なし</option>
                <option value="even">偶数</option>
                <option value="odd">奇数</option>
              </select>
            </div>
            <div className="setting-group">
              <label>フロー制御:</label>
              <select
                value={connectionSettings.flowControl}
                onChange={(e) => setConnectionSettings(prev => ({...prev, flowControl: e.target.value}))}
                disabled={isConnected}
              >
                <option value="none">なし</option>
                <option value="hardware">ハードウェア</option>
              </select>
            </div>
          </div>

          <div className="connection-panel">
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? <PlugZap size={20} /> : <Plug size={20} />}
              <span>{isConnected ? '接続中' : '未接続'}</span>
              {status?.port && (
                <span className="port-info">
                  (VID: {status.port.usbVendorId?.toString(16)}, PID: {status.port.usbProductId?.toString(16)})
                </span>
              )}
            </div>
            <button
              onClick={isConnected ? handleDisconnect : handleConnect}
              className={`connect-button ${isConnected ? 'disconnect' : 'connect'}`}
              disabled={!isWebSerialSupported}
            >
              {isConnected ? '切断' : 'ポート選択・接続'}
            </button>
          </div>

          {error && (
            <div className="error-banner">
              <span>エラー: {error}</span>
            </div>
          )}
        </div>
      )}

      <div className="feature-grid">
        {features.map((feature) => {
          const IconComponent = feature.icon;
          const isDisabled = !isWebSerialSupported;

          return (
            <div
              key={feature.id}
              className={`feature-card ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && onSelectFeature(feature.id)}
              style={{ '--accent-color': feature.color }}
            >
              <div className="feature-icon">
                <IconComponent size={48} />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              {isDisabled && (
                <div className="disabled-overlay">
                  <span>利用不可</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="menu-footer">
        <p>シリアル通信機能を使用するには、WebSerial API対応ブラウザが必要です。</p>
      </div>
    </div>
  );
};

export default MenuScreen;
