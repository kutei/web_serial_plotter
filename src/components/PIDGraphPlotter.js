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
    sendData,
    addDataCallback,
    removeDataCallback,
    isSupported
  } = useSerialContext();

  const [isRecording, setIsRecording] = useState(false);
  const [dataBuffer, setDataBuffer] = useState('');
  const [plotData, setPlotData] = useState({
    timestamps: [],
    pidInput: [],
    pidTarget: [],
    pidOutput: []
  });
  const [settings, setSettings] = useState({
    maxDataPoints: 1000,
    updateInterval: 100,
    yAxisMin: -100,
    yAxisMax: 100,
    autoScale: true,
    command: 'l'  // デフォルトコマンド（PIDデータ）
  });
  const [showSettings, setShowSettings] = useState(false);
  const [statistics, setStatistics] = useState({
    pidInput: { min: 0, max: 0, avg: 0 },
    pidTarget: { min: 0, max: 0, avg: 0 },
    pidOutput: { min: 0, max: 0, avg: 0 },
    count: 0
  });

  const chartRef = useRef(null);
  const startTimeRef = useRef(null);

  // Parse incoming data for PID values (expects CSV: input,target,output)
  const parseData = (rawData) => {
    const lines = rawData.split('\n');
    const pidDataArray = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.debug(`Raw data: "${trimmed}"`);
        // Parse CSV format: input,target,output
        const parts = trimmed.split(',');
        if (parts.length >= 3) {
          const pidInput = parseFloat(parts[0]);
          const pidTarget = parseFloat(parts[1]);
          const pidOutput = parseFloat(parts[2]);

          if (!isNaN(pidInput) && !isNaN(pidTarget) && !isNaN(pidOutput)) {
            const pidData = {
              input: pidInput,
              target: pidTarget,
              output: pidOutput
            };
            pidDataArray.push(pidData);
          } else {
            console.warn(`Invalid numeric data in "${trimmed}": input=${pidInput}, target=${pidTarget}, output=${pidOutput}`);
          }
        } else {
          console.warn(`Insufficient data parts in "${trimmed}" (${parts.length}), expected at least 3`);
        }
      }
    }

    return pidDataArray;
  };

  // Handle incoming serial data
  useEffect(() => {
    const handleData = (data) => {
      if (!isRecording) return;

      setDataBuffer(prev => {
        const newBuffer = prev + data;
        const pidDataArray = parseData(newBuffer);

        if (pidDataArray.length > 0) {
          const now = Date.now();
          if (!startTimeRef.current) {
            startTimeRef.current = now;
          }

          setPlotData(prevPlotData => {
            const newTimestamps = [...prevPlotData.timestamps];
            const newPidInput = [...prevPlotData.pidInput];
            const newPidTarget = [...prevPlotData.pidTarget];
            const newPidOutput = [...prevPlotData.pidOutput];

            pidDataArray.forEach(pidData => {
              const relativeTime = (now - startTimeRef.current) / 1000; // seconds
              newTimestamps.push(relativeTime);
              newPidInput.push(pidData.input);
              newPidTarget.push(pidData.target);
              newPidOutput.push(pidData.output);
            });

            // Limit data points
            if (newTimestamps.length > settings.maxDataPoints) {
              const excess = newTimestamps.length - settings.maxDataPoints;
              newTimestamps.splice(0, excess);
              newPidInput.splice(0, excess);
              newPidTarget.splice(0, excess);
              newPidOutput.splice(0, excess);
            }

            // Update statistics
            if (newPidInput.length > 0) {
              const calculateStats = (values) => ({
                min: Math.min(...values).toFixed(2),
                max: Math.max(...values).toFixed(2),
                avg: (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2)
              });

              setStatistics({
                pidInput: calculateStats(newPidInput),
                pidTarget: calculateStats(newPidTarget),
                pidOutput: calculateStats(newPidOutput),
                count: newTimestamps.length
              });
            }

            return {
              timestamps: newTimestamps,
              pidInput: newPidInput,
              pidTarget: newPidTarget,
              pidOutput: newPidOutput
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

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (window.pidPlotterInterval) {
        clearInterval(window.pidPlotterInterval);
        window.pidPlotterInterval = null;
      }
    };
  }, []);

  // Handle disconnection automatically
  useEffect(() => {
    if (!isConnected && isRecording) {
      setIsRecording(false);
      if (window.pidPlotterInterval) {
        clearInterval(window.pidPlotterInterval);
        window.pidPlotterInterval = null;
      }
    }
  }, [isConnected, isRecording]);

  // Send command
  const sendCommand = async (command) => {
    if (!isConnected) return false;
    try {
      console.debug(`Sending command: ${command}`);
      await sendData(command, '\r\n');
      return true;
    } catch (err) {
      console.error('Failed to send command:', err);
      return false;
    }
  };

  // Start/Stop recording
  const toggleRecording = async () => {
    if (!isConnected) return;

    if (!isRecording) {
      console.log('Starting recording...');
      // Enable tool mode
      console.debug('Sending: enable tool_mode');
      await sendData('enable tool_mode', '\r\n');

      // Start recording
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setPlotData({ timestamps: [], pidInput: [], pidTarget: [], pidOutput: [] });
      setDataBuffer('');

      // Start sending commands periodically
      console.debug(`Starting periodic command transmission: ${settings.command} every ${settings.updateInterval}ms`);
      const intervalId = setInterval(() => {
        sendCommand(settings.command);
      }, settings.updateInterval);

      // Store interval ID for cleanup
      window.pidPlotterInterval = intervalId;
    } else {
      // Stop recording
      console.log('Stopping recording...');
      setIsRecording(false);
      if (window.pidPlotterInterval) {
        clearInterval(window.pidPlotterInterval);
        window.pidPlotterInterval = null;
        console.debug('Stopped periodic command transmission');
      }

      // Disable tool mode
      console.debug('Sending: disable tool_mode');
      await sendData('disable tool_mode', '\r\n');
      console.log('Recording stopped');
    }
  };

  // Clear data
  const clearData = () => {
    setPlotData({ timestamps: [], pidInput: [], pidTarget: [], pidOutput: [] });
    setDataBuffer('');
    setStatistics({
      pidInput: { min: 0, max: 0, avg: 0 },
      pidTarget: { min: 0, max: 0, avg: 0 },
      pidOutput: { min: 0, max: 0, avg: 0 },
      count: 0
    });
    startTimeRef.current = null;
  };

  // Export data
  const exportData = () => {
    const csvContent = [
      'Time(s),PID_Input,PID_Target,PID_Output',
      ...plotData.timestamps.map((time, index) =>
        `${time},${plotData.pidInput[index]},${plotData.pidTarget[index]},${plotData.pidOutput[index]}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pid-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chart configuration for Input/Target
  const inputTargetChartData = {
    labels: plotData.timestamps,
    datasets: [
      {
        label: 'PID Input',
        data: plotData.pidInput,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      },
      {
        label: 'PID Target',
        data: plotData.pidTarget,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  };

  // Chart configuration for Output
  const outputChartData = {
    labels: plotData.timestamps,
    datasets: [
      {
        label: 'PID Output',
        data: plotData.pidOutput,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  };

  // Chart options for Input/Target
  const inputTargetChartOptions = {
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
        text: 'PID Input & Target'
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

  // Chart options for Output
  const outputChartOptions = {
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
        text: 'PID Output'
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
          text: 'Output値'
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
          <button onClick={exportData} className="action-button" disabled={plotData.timestamps.length === 0}>
            <Download size={20} />
          </button>
          <button onClick={clearData} className="action-button" disabled={plotData.timestamps.length === 0}>
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>グラフ設定</h3>
          <div className="settings-grid">
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
              <label>更新間隔 (ms):</label>
              <input
                type="number"
                value={settings.updateInterval}
                onChange={(e) => setSettings(prev => ({...prev, updateInterval: parseInt(e.target.value)}))}
                min="10"
                max="1000"
                disabled={isRecording}
              />
            </div>
            <div className="setting-group">
              <label>コマンド:</label>
              <select
                value={settings.command}
                onChange={(e) => setSettings(prev => ({...prev, command: e.target.value}))}
                disabled={isRecording}
              >
                <option value="l">l (PIDデータ)</option>
                <option value="s">s (システム情報)</option>
                <option value="e">e (エンコーダ)</option>
                <option value="c">c (ステータス)</option>
              </select>
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
          <span>
            {isConnected ? '接続中' : 'メニュー画面で接続・通信設定してください'}
          </span>
          {status?.port && (
            <span className="port-info">
              (VID: {status.port.usbVendorId?.toString(16)}, PID: {status.port.usbProductId?.toString(16)})
            </span>
          )}
        </div>

        <div className="recording-controls">
          <button
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
        <div className="stat-group">
          <span className="stat-group-title">PID Input:</span>
          <div className="stat-values">
            <span className="stat-value">Min: {statistics.pidInput.min}</span>
            <span className="stat-value">Max: {statistics.pidInput.max}</span>
            <span className="stat-value">Avg: {statistics.pidInput.avg}</span>
          </div>
        </div>
        <div className="stat-group">
          <span className="stat-group-title">PID Target:</span>
          <div className="stat-values">
            <span className="stat-value">Min: {statistics.pidTarget.min}</span>
            <span className="stat-value">Max: {statistics.pidTarget.max}</span>
            <span className="stat-value">Avg: {statistics.pidTarget.avg}</span>
          </div>
        </div>
        <div className="stat-group">
          <span className="stat-group-title">PID Output:</span>
          <div className="stat-values">
            <span className="stat-value">Min: {statistics.pidOutput.min}</span>
            <span className="stat-value">Max: {statistics.pidOutput.max}</span>
            <span className="stat-value">Avg: {statistics.pidOutput.avg}</span>
          </div>
        </div>
      </div>

      <div className="charts-container">
        {plotData.timestamps.length > 0 ? (
          <>
            <div className="chart-section">
              <Line data={inputTargetChartData} options={inputTargetChartOptions} />
            </div>
            <div className="chart-section">
              <Line ref={chartRef} data={outputChartData} options={outputChartOptions} />
            </div>
          </>
        ) : (
          <div className="empty-chart">
            <p>グラフデータがここに表示されます</p>
            <p>シリアルポートに接続して記録を開始してください</p>
            <div className="data-format-info">
              <h4>データ形式:</h4>
              <ul>
                <li>CSV形式: input,target,output</li>
                <li>例: "123,456,0.7890"</li>
                <li>tool_modeが自動的に有効化されます</li>
                <li>選択したコマンドが定期的に送信されます</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PIDGraphPlotter;
