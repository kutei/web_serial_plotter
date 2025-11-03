import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play, Pause, Settings as SettingsIcon } from 'lucide-react';
import { useSerialContext } from '../contexts/SerialContext';

const MAX_HISTORY_LENGTH = 100;

const SystemMonitor = ({ onBack }) => {
  const { isConnected, sendCommand } = useSerialContext();

  // sendCommandをrefに保存して、依存配列の問題を回避
  const sendCommandRef = useRef(sendCommand);

  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);

  // 実行制御
  const [isRunning, setIsRunning] = useState(false);
  const [interval, setInterval] = useState(100); // ms
  const [showSettings, setShowSettings] = useState(false);

  // データ保存
  const [encoderData, setEncoderData] = useState({
    initialized: false,
    upperLimit: false,
    value: 0,
    history: []
  });

  const [sbusData, setSbusData] = useState({
    ch1: 0, ch2: 0, ch3: 0, ch4: 0,
    boom: 0, roll: 0, move: 0,
    sleepCounter: 0,
    ch9: 0, ch10: 0,
    failsafe: false, lostFrame: false,
    dt0: 0, dt1: 0,
    history: {
      ch1: [], ch2: [], ch3: [], ch4: [],
      boom: [], roll: [], move: []
    }
  });

  const intervalRef = useRef(null);
  const dataBufferRef = useRef('');

  // パース関数をrefに保存（レンダリング間で安定した参照を保持）
  const parseEncoderDataRef = useRef();
  const parseSbusDataRef = useRef();

  // パース関数の定義（useCallbackは使わない）
  // これらの関数はレンダリングごとに再定義されるが、refに格納することで
  // イベントリスナーは常に最新の関数を使用できる
  parseEncoderDataRef.current = useCallback((line) => {
    // "enc:%d,%d,%d" をパース
    const match = line.match(/enc:(\d+),(\d+),(-?\d+)/);
    if (match) {
      const initialized = parseInt(match[1]) !== 0;
      const upperLimit = parseInt(match[2]) !== 0;
      const value = parseInt(match[3]);

      setEncoderData(prev => ({
        initialized,
        upperLimit,
        value,
        history: [...prev.history.slice(-MAX_HISTORY_LENGTH + 1), {
          timestamp: Date.now(),
          value
        }]
      }));
    }
  }, []);

  parseSbusDataRef.current = useCallback((line) => {
    // "1:%+3.02f, 2:%+3.02f, 3:%+3.02f, 4:%+3.02f, b:%+3.02f, r:%+3.02f, m:%+3.02f, slp:%4d, 9:%4d,10:%4d, fs:%1d, lf:%1d dt0:%+3.02f, dt1:%+3.02f"
    const regex = /1:([\+\-]\d+\.\d+),\s*2:([\+\-]\d+\.\d+),\s*3:([\+\-]\d+\.\d+),\s*4:([\+\-]\d+\.\d+),\s*b:([\+\-]\d+\.\d+),\s*r:([\+\-]\d+\.\d+),\s*m:([\+\-]\d+\.\d+),\s*slp:\s*(\d+),\s*9:\s*(\d+),10:\s*(\d+),\s*fs:\s*(\d+),\s*lf:\s*(\d+)\s*dt0:([\+\-]\d+\.\d+),\s*dt1:([\+\-]\d+\.\d+)/;
    const match = line.match(regex);

    if (match) {
      const timestamp = Date.now();
      const ch1 = parseFloat(match[1]);
      const ch2 = parseFloat(match[2]);
      const ch3 = parseFloat(match[3]);
      const ch4 = parseFloat(match[4]);
      const boom = parseFloat(match[5]);
      const roll = parseFloat(match[6]);
      const move = parseFloat(match[7]);
      const sleepCounter = parseInt(match[8]);
      const ch9 = parseInt(match[9]);
      const ch10 = parseInt(match[10]);
      const failsafe = parseInt(match[11]) !== 0;
      const lostFrame = parseInt(match[12]) !== 0;
      const dt0 = parseFloat(match[13]);
      const dt1 = parseFloat(match[14]);

      setSbusData(prev => ({
        ch1, ch2, ch3, ch4,
        boom, roll, move,
        sleepCounter,
        ch9, ch10,
        failsafe, lostFrame,
        dt0, dt1,
        history: {
          ch1: [...prev.history.ch1.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: ch1 }],
          ch2: [...prev.history.ch2.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: ch2 }],
          ch3: [...prev.history.ch3.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: ch3 }],
          ch4: [...prev.history.ch4.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: ch4 }],
          boom: [...prev.history.boom.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: boom }],
          roll: [...prev.history.roll.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: roll }],
          move: [...prev.history.move.slice(-MAX_HISTORY_LENGTH + 1), { timestamp, value: move }]
        }
      }));
    }
  }, []);

  // シリアルデータ受信のリスナー設定
  useEffect(() => {
    const handleSerialData = (event) => {
      const text = event.detail;
      dataBufferRef.current += text;

      // 改行で分割して処理
      const lines = dataBufferRef.current.split('\n');
      dataBufferRef.current = lines.pop() || '';

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('enc:')) {
          parseEncoderDataRef.current?.(trimmed);
        } else if (trimmed.match(/^1:/)) {
          parseSbusDataRef.current?.(trimmed);
        }
      });
    };

    window.addEventListener('serial-data', handleSerialData);
    return () => {
      window.removeEventListener('serial-data', handleSerialData);
    };
  }, []); // 空の依存配列：マウント時のみ実行

  // 定期実行タイマー
  useEffect(() => {
    if (isRunning && isConnected) {
      intervalRef.current = setInterval(async () => {
        try {
          await sendCommandRef.current('e');
          await sendCommandRef.current('s');
        } catch (error) {
          console.error('Command execution failed:', error);
        }
      }, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, interval, isConnected]);

  const handleStartStop = () => {
    setIsRunning(!isRunning);
  };

  const intervalOptions = [
    { label: '100ms', value: 100 },
    { label: '200ms', value: 200 },
    { label: '500ms', value: 500 },
    { label: '1sec', value: 1000 },
    { label: '2sec', value: 2000 },
    { label: '5sec', value: 5000 },
    { label: '10sec', value: 10000 }
  ];

  // プログレスバーコンポーネント
  const ProgressBar = ({ value, min = -1, max = 1, label }) => {
    const percentage = ((value - min) / (max - min)) * 100;
    const displayValue = value.toFixed(2);

    return (
      <div className="progress-bar-container">
        <div className="progress-bar-label">
          <span>{label}</span>
          <span className="progress-bar-value">{displayValue}</span>
        </div>
        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
          />
          <div className="progress-bar-center" style={{ left: '50%' }} />
        </div>
      </div>
    );
  };

  return (
    <div className="system-monitor">
      <div className="monitor-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={20} />
          戻る
        </button>
        <h2>システムモニター</h2>
        <div className="header-controls">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="settings-toggle"
            title="設定"
          >
            <SettingsIcon size={20} />
          </button>
          <button
            onClick={handleStartStop}
            className={`monitor-control-button ${isRunning ? 'running' : ''}`}
            disabled={!isConnected}
            title={isRunning ? '停止' : '開始'}
          >
            {isRunning ? <Pause size={20} /> : <Play size={20} />}
            {isRunning ? '停止' : '開始'}
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="warning-message">
          <p>⚠️ シリアルポートに接続してください</p>
        </div>
      )}

      {showSettings && (
        <div className="monitor-settings-panel">
          <h3>モニター設定</h3>
          <div className="setting-group">
            <label>実行周期:</label>
            <select
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value))}
              disabled={isRunning}
            >
              {intervalOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="monitor-content">
        {/* エンコーダセクション */}
        <div className="monitor-section">
          <h3>エンコーダ情報</h3>
          <div className="encoder-status">
            <div className="status-item">
              <span className="status-label">初期化状態:</span>
              <span className={`status-badge ${encoderData.initialized ? 'success' : 'warning'}`}>
                {encoderData.initialized ? '初期化済み' : '未初期化'}
              </span>
            </div>
            {!encoderData.initialized && (
              <div className="status-item">
                <span className="status-label">リミット位置:</span>
                <span className={`status-badge ${encoderData.upperLimit ? 'error' : 'info'}`}>
                  {encoderData.upperLimit ? '上側' : '下側'}
                </span>
              </div>
            )}
            <div className="status-item">
              <span className="status-label">エンコーダ値:</span>
              <span className="encoder-value">{encoderData.value}</span>
            </div>
          </div>

          {/* エンコーダグラフ */}
          <div className="mini-chart">
            <svg width="100%" height="100" viewBox="0 0 400 100">
              <line x1="0" y1="50" x2="400" y2="50" stroke="#333" strokeWidth="1" />
              {encoderData.history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2"
                  points={encoderData.history.map((point, idx) => {
                    const x = (idx / Math.max(1, encoderData.history.length - 1)) * 400;
                    const y = 50 - (point.value / 1000) * 40; // スケーリングは適宜調整
                    return `${x},${Math.max(0, Math.min(100, y))}`;
                  }).join(' ')}
                />
              )}
            </svg>
          </div>
        </div>

        {/* SBUSセクション */}
        <div className="monitor-section">
          <h3>SBUS2 データ</h3>

          {/* ステータスバッジ */}
          <div className="sbus-status">
            <span className={`status-badge ${sbusData.failsafe ? 'error' : 'success'}`}>
              {sbusData.failsafe ? 'FAILSAFE' : '正常'}
            </span>
            <span className={`status-badge ${sbusData.lostFrame ? 'warning' : 'success'}`}>
              {sbusData.lostFrame ? 'LOST FRAME' : 'フレーム受信中'}
            </span>
            <span className="status-info">
              スリープカウント: {sbusData.sleepCounter}
            </span>
          </div>

          {/* メインチャンネル */}
          <div className="channel-section">
            <h4>制御チャンネル</h4>
            <ProgressBar value={sbusData.ch1} label="CH1" />
            <ProgressBar value={sbusData.ch2} label="CH2" />
            <ProgressBar value={sbusData.ch3} label="CH3" />
            <ProgressBar value={sbusData.ch4} label="CH4" />
          </div>

          {/* 軸制御 */}
          <div className="channel-section">
            <h4>軸制御</h4>
            <ProgressBar value={sbusData.boom} label="ブーム (上下)" />
            <ProgressBar value={sbusData.roll} label="ロール (回転)" />
            <ProgressBar value={sbusData.move} label="移動入力" />
          </div>

          {/* 予備チャンネル */}
          <div className="channel-section">
            <h4>予備チャンネル</h4>
            <div className="channel-grid">
              <div className="channel-value">
                <span>CH9:</span>
                <strong>{sbusData.ch9}</strong>
              </div>
              <div className="channel-value">
                <span>CH10:</span>
                <strong>{sbusData.ch10}</strong>
              </div>
            </div>
          </div>

          {/* デジタルトリム */}
          <div className="channel-section">
            <h4>デジタルトリム</h4>
            <ProgressBar value={sbusData.dt0} label="DT0" />
            <ProgressBar value={sbusData.dt1} label="DT1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemMonitor;
