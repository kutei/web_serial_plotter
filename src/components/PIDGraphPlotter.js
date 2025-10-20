import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Wifi, WifiOff, Settings, Download, Trash2, Play, Pause } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { useSerialContext } from '../contexts/SerialContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const PIDGraphPlotter = ({ onBack }) => {
  const {
    isConnected,
    status,
    error,
    connect,
    disconnect,
    addDataCallback,
    removeDataCallback,
    isSupported
  } = useSerialContext();

  const [isRecording, setIsRecording] = useState(false);
  const [dataBuffer, setDataBuffer] = useState('');
  const [plotData, setPlotData] = useState({
    timestamps: [],
    values: []
  });
  const [settings, setSettings] = useState({
    baudRate: 115200,
    maxDataPoints: 1000,
    updateInterval: 100,
    yAxisMin: -100,
    yAxisMax: 100,
    autoScale: true
  });
  const [showSettings, setShowSettings] = useState(false);
  const [statistics, setStatistics] = useState({
    min: 0,
    max: 0,
    avg: 0,
    count: 0
  });

  const chartRef = useRef(null);
  const startTimeRef = useRef(null);

  // Parse incoming data for PID values
  const parseData = (rawData) => {
    // Simple parsing - assumes data comes as numbers or comma-separated values
    const lines = rawData.split('\n');
    const values = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        // Try to parse as a single number first
        const singleValue = parseFloat(trimmed);
        if (!isNaN(singleValue)) {
          values.push(singleValue);
        } else {
          // Try to parse as comma-separated values (take first value)
          const parts = trimmed.split(',');
          const firstValue = parseFloat(parts[0]);
          if (!isNaN(firstValue)) {
            values.push(firstValue);
          }
        }
      }
    }

    return values;
  };

  // Handle incoming serial data
  useEffect(() => {
    const handleData = (data) => {
      if (!isRecording) return;

      setDataBuffer(prev => {
        const newBuffer = prev + data;
        const values = parseData(newBuffer);

        if (values.length > 0) {
          const now = Date.now();
          if (!startTimeRef.current) {
            startTimeRef.current = now;
          }

          setPlotData(prevPlotData => {
            const newTimestamps = [...prevPlotData.timestamps];
            const newValues = [...prevPlotData.values];

            values.forEach(value => {
              const relativeTime = (now - startTimeRef.current) / 1000; // seconds
              newTimestamps.push(relativeTime);
              newValues.push(value);
            });

            // Limit data points
            if (newTimestamps.length > settings.maxDataPoints) {
              const excess = newTimestamps.length - settings.maxDataPoints;
              newTimestamps.splice(0, excess);
              newValues.splice(0, excess);
            }

            // Update statistics
            if (newValues.length > 0) {
              const min = Math.min(...newValues);
              const max = Math.max(...newValues);
              const avg = newValues.reduce((sum, val) => sum + val, 0) / newValues.length;

              setStatistics({
                min: min.toFixed(2),
                max: max.toFixed(2),
                avg: avg.toFixed(2),
                count: newValues.length
              });
            }

            return {
              timestamps: newTimestamps,
              values: newValues
            };
          });

          // Clear processed data from buffer
          return '';
        }

        return newBuffer;
      });
    };

    addDataCallback(handleData);
    return () => removeDataCallback(handleData);
  }, [addDataCallback, removeDataCallback, isRecording, settings.maxDataPoints]);

  // Handle disconnection (connection is handled in menu)
  const handleDisconnect = async () => {
    try {
      await disconnect();
      setIsRecording(false);
    } catch (err) {
      console.error('Disconnection failed:', err);
    }
  };

  // Start/Stop recording
  const toggleRecording = () => {
    if (!isConnected) return;

    if (!isRecording) {
      // Start recording
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setPlotData({ timestamps: [], values: [] });
      setDataBuffer('');
    } else {
      // Stop recording
      setIsRecording(false);
    }
  };

  // Clear data
  const clearData = () => {
    setPlotData({ timestamps: [], values: [] });
    setDataBuffer('');
    setStatistics({ min: 0, max: 0, avg: 0, count: 0 });
    startTimeRef.current = null;
  };

  // Export data
  const exportData = () => {
    const csvContent = [
      'Time(s),Value',
      ...plotData.timestamps.map((time, index) => `${time},${plotData.values[index]}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pid-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chart configuration
  const chartData = {
    labels: plotData.timestamps,
    datasets: [
      {
        label: 'PID Output',
        data: plotData.values,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        position: 'top'
      },
      title: {
        display: true,
        text: 'PID制御結果リアルタイムプロッター'
      }
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: '時間 (秒)'
        }
      },
      y: {
        title: {
          display: true,
          text: '値'
        },
        min: settings.autoScale ? undefined : settings.yAxisMin,
        max: settings.autoScale ? undefined : settings.yAxisMax
      }
    }
  };

  if (!isSupported()) {
    return (
      <div className="plotter-container">
        <div className="plotter-header">
          <button onClick={onBack} className="back-button">
            <ArrowLeft size={20} />
            戻る
          </button>
          <h2>PIDグラフプロッター</h2>
        </div>
        <div className="error-message">
          <p>{error || 'WebSerial APIが利用できません。'}</p>
          <p>メニュー画面で詳細な対応状況をご確認ください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="plotter-container">
      <div className="plotter-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={20} />
          戻る
        </button>
        <h2>PIDグラフプロッター</h2>
        <div className="plotter-actions">
          <button onClick={() => setShowSettings(!showSettings)} className="settings-button">
            <Settings size={20} />
          </button>
          <button onClick={exportData} className="action-button" disabled={plotData.values.length === 0}>
            <Download size={20} />
          </button>
          <button onClick={clearData} className="action-button" disabled={plotData.values.length === 0}>
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>設定</h3>
          <div className="settings-grid">
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
              <label>最大データ点数:</label>
              <input
                type="number"
                value={settings.maxDataPoints}
                onChange={(e) => setSettings(prev => ({...prev, maxDataPoints: parseInt(e.target.value)}))}
                min="100"
                max="10000"
              />
            </div>
            <div className="setting-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.autoScale}
                  onChange={(e) => setSettings(prev => ({...prev, autoScale: e.target.checked}))}
                />
                Y軸自動スケール
              </label>
            </div>
            {!settings.autoScale && (
              <>
                <div className="setting-group">
                  <label>Y軸最小値:</label>
                  <input
                    type="number"
                    value={settings.yAxisMin}
                    onChange={(e) => setSettings(prev => ({...prev, yAxisMin: parseFloat(e.target.value)}))}
                  />
                </div>
                <div className="setting-group">
                  <label>Y軸最大値:</label>
                  <input
                    type="number"
                    value={settings.yAxisMax}
                    onChange={(e) => setSettings(prev => ({...prev, yAxisMax: parseFloat(e.target.value)}))}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="control-panel">
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
          <span>{isConnected ? '接続中' : 'メニュー画面で接続してください'}</span>
          {status?.port && (
            <span className="port-info">
              (VID: {status.port.usbVendorId?.toString(16)}, PID: {status.port.usbProductId?.toString(16)})
            </span>
          )}
        </div>

        <div className="recording-controls">
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="connect-button disconnect"
            >
              切断
            </button>
          )}          <button
            onClick={toggleRecording}
            disabled={!isConnected}
            className={`record-button ${isRecording ? 'recording' : 'stopped'}`}
          >
            {isRecording ? <Pause size={16} /> : <Play size={16} />}
            {isRecording ? '停止' : '記録開始'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>エラー: {error}</span>
        </div>
      )}

      <div className="statistics-panel">
        <div className="stat-item">
          <span className="stat-label">データ点数:</span>
          <span className="stat-value">{statistics.count}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">最小値:</span>
          <span className="stat-value">{statistics.min}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">最大値:</span>
          <span className="stat-value">{statistics.max}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">平均値:</span>
          <span className="stat-value">{statistics.avg}</span>
        </div>
      </div>

      <div className="chart-container">
        {plotData.values.length > 0 ? (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        ) : (
          <div className="empty-chart">
            <p>グラフデータがここに表示されます</p>
            <p>シリアルポートに接続して記録を開始してください</p>
            <div className="data-format-info">
              <h4>データ形式:</h4>
              <ul>
                <li>1行に1つの数値</li>
                <li>カンマ区切りの場合は最初の値を使用</li>
                <li>例: "123.45" または "123.45,67.89,..."</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PIDGraphPlotter;
