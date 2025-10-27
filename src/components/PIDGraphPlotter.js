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
  const [plotData, setPlotData] = useState({
    timestamps: [],
    datasets: []  // 動的なデータセット配列
  });
  const [chartConfig, setChartConfig] = useState(null); // グラフ設定: {charts: [{title: string, datasets: [{label: string, dataIndex: number}]}]}
  const [settings, setSettings] = useState({
    maxDataPoints: 1000,
    updateInterval: 20,  // C++のlコマンドに渡すms間隔
    yAxisMin: -100,
    yAxisMax: 100,
    autoScale: true,
    command: 'l'  // lコマンド（引数は updateInterval で指定）
  });
  const [showSettings, setShowSettings] = useState(false);
  const [statistics, setStatistics] = useState([]);  // 動的な統計情報配列

  const chartRef = useRef(null);
  const startTimeRef = useRef(null);
  const configReceivedRef = useRef(false);

  // Parse config line (e.g., "conf=0:PID Input,0:PID Target,1:PID Output")
  const parseConfigLine = (configLine) => {
    if (!configLine.startsWith('conf=')) return null;

    const configStr = configLine.substring(5); // Remove "conf="
    const parts = configStr.split(',');

    const charts = [];
    const datasetConfigs = [];

    parts.forEach((part, index) => {
      const trimmed = part.trim();
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) return;

      const chartIndex = parseInt(trimmed.substring(0, colonIndex));
      const label = trimmed.substring(colonIndex + 1).trim();

      if (isNaN(chartIndex)) return;

      datasetConfigs.push({
        chartIndex,
        label,
        dataIndex: index
      });

      // Ensure charts array has enough elements
      while (charts.length <= chartIndex) {
        charts.push({ datasets: [] });
      }

      charts[chartIndex].datasets.push({
        label,
        dataIndex: index
      });
    });

    console.log('Parsed chart config:', { charts, datasetConfigs });
    return { charts, datasetCount: parts.length };
  };

  // Parse incoming data for PID values (expects CSV: input,target,output)
  // C++ output format: %d,%d,%.4f (int input, int target, float output)
  // Note: serialManager.js ensures we only receive complete lines (ending with \n)
  const parseData = (rawData) => {
    const lines = rawData.split('\n');
    const dataArray = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.debug(`Raw data: "${trimmed}"`);

        // Check if this is a config line
        if (trimmed.startsWith('conf=')) {
          const config = parseConfigLine(trimmed);
          if (config && !configReceivedRef.current) {
            setChartConfig(config);
            configReceivedRef.current = true;
            console.log('Chart configuration received:', config);
          }
          continue;
        }

        // Parse CSV data
        const parts = trimmed.split(',');
        if (parts.length >= 1) {
          const values = parts.map(p => parseFloat(p));

          // Check if all values are valid numbers
          if (values.every(v => !isNaN(v))) {
            dataArray.push(values);
          } else {
            console.warn(`Invalid numeric data in "${trimmed}"`);
          }
        }
      }
    }

    return dataArray;
  };

  // Handle incoming serial data
  useEffect(() => {
    const handleData = (data) => {
      if (!isRecording) return;

      // serialManager.js already handles line buffering, so data always contains complete lines
      const dataArray = parseData(data);

      if (dataArray.length > 0) {
        const now = Date.now();
        if (!startTimeRef.current) {
          startTimeRef.current = now;
        }

        setPlotData(prevPlotData => {
          const newTimestamps = [...prevPlotData.timestamps];
          const newDatasets = prevPlotData.datasets.map(ds => [...ds]);

          dataArray.forEach(values => {
            const relativeTime = (now - startTimeRef.current) / 1000; // seconds
            newTimestamps.push(relativeTime);

            // Initialize datasets if needed
            while (newDatasets.length < values.length) {
              newDatasets.push([]);
            }

            // Add values to corresponding datasets
            values.forEach((value, index) => {
              if (index < newDatasets.length) {
                newDatasets[index].push(value);
              }
            });
          });

          // Limit data points
          if (newTimestamps.length > settings.maxDataPoints) {
            const excess = newTimestamps.length - settings.maxDataPoints;
            newTimestamps.splice(0, excess);
            newDatasets.forEach(ds => ds.splice(0, excess));
          }

          // Update statistics
          if (newTimestamps.length > 0 && newDatasets.length > 0) {
            const calculateStats = (values) => {
              if (values.length === 0) return { min: 0, max: 0, avg: 0 };
              return {
                min: Math.min(...values).toFixed(2),
                max: Math.max(...values).toFixed(2),
                avg: (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2)
              };
            };

            const newStats = newDatasets.map((ds, index) => ({
              index,
              label: chartConfig?.charts?.flatMap(c => c.datasets).find(d => d.dataIndex === index)?.label || `Data ${index}`,
              ...calculateStats(ds)
            }));

            setStatistics(newStats);
          }

          return {
            timestamps: newTimestamps,
            datasets: newDatasets
          };
        });
      }
    };

    addDataCallback(handleData);
    return () => removeDataCallback(handleData);
  }, [addDataCallback, removeDataCallback, isRecording, settings.maxDataPoints, chartConfig]);

  // Handle disconnection automatically
  useEffect(() => {
    if (!isConnected && isRecording) {
      setIsRecording(false);
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
      configReceivedRef.current = false;
      setChartConfig(null);
      setPlotData({ timestamps: [], datasets: [] });
      setStatistics([]);

      // Send l command once with interval parameter - C++ will handle continuous transmission
      const commandWithInterval = `${settings.command} ${settings.updateInterval}`;
      console.debug(`Sending l command: ${commandWithInterval}`);
      await sendCommand(commandWithInterval);
      console.log('Recording started - C++ is now sending data continuously');
    } else {
      // Stop recording by sending Ctrl+C to interrupt the l command
      console.log('Stopping recording...');
      setIsRecording(false);

      // Send Ctrl+C (ASCII 3) to stop the l command
      console.debug('Sending Ctrl+C to stop l command');
      await sendData('\x03', '');  // Ctrl+C without line ending

      // Disable tool mode
      console.debug('Sending: disable tool_mode');
      await sendData('disable tool_mode', '\r\n');
      console.log('Recording stopped');
    }
  };

  // Clear data
  const clearData = () => {
    setPlotData({ timestamps: [], datasets: [] });
    setStatistics([]);
    startTimeRef.current = null;
    configReceivedRef.current = false;
    setChartConfig(null);
  };

  // Export data
  const exportData = () => {
    // Create header with labels from chart config
    const headers = ['Time(s)'];
    if (chartConfig && chartConfig.charts) {
      chartConfig.charts.forEach(chart => {
        chart.datasets.forEach(ds => {
          headers.push(ds.label);
        });
      });
    } else {
      // Fallback to generic column names
      plotData.datasets.forEach((_, index) => {
        headers.push(`Data_${index}`);
      });
    }

    const csvContent = [
      headers.join(','),
      ...plotData.timestamps.map((time, index) => {
        const row = [time];
        plotData.datasets.forEach(dataset => {
          row.push(dataset[index] !== undefined ? dataset[index] : '');
        });
        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pid-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate dynamic chart data based on config
  const generateChartData = () => {
    if (!chartConfig || !chartConfig.charts) {
      return [];
    }

    const colors = [
      { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },
      { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },
      { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
      { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' },
      { border: 'rgb(251, 146, 60)', background: 'rgba(251, 146, 60, 0.1)' },
      { border: 'rgb(236, 72, 153)', background: 'rgba(236, 72, 153, 0.1)' },
    ];

    return chartConfig.charts.map((chart, chartIndex) => {
      const datasets = chart.datasets.map((ds, dsIndex) => {
        const colorIndex = (chartIndex * 2 + dsIndex) % colors.length;
        return {
          label: ds.label,
          data: plotData.datasets[ds.dataIndex] || [],
          borderColor: colors[colorIndex].border,
          backgroundColor: colors[colorIndex].background,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1
        };
      });

      return {
        labels: plotData.timestamps,
        datasets
      };
    });
  };

  // Generate chart options
  const generateChartOptions = (chartIndex) => {
    const chartTitle = chartConfig?.charts?.[chartIndex]?.title ||
                       `グラフ ${chartIndex + 1}`;

    return {
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
          text: chartTitle
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
  };

  const chartDataArray = generateChartData();

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
              <label>データ送信間隔 (ms):</label>
              <input
                type="number"
                value={settings.updateInterval}
                onChange={(e) => setSettings(prev => ({...prev, updateInterval: parseInt(e.target.value)}))}
                min="10"
                max="1000"
                disabled={isRecording}
                title="C++のlコマンドがデータを送信する間隔"
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
          <span className="stat-value">{plotData.timestamps.length}</span>
        </div>
        {statistics.map((stat, index) => (
          <div key={index} className="stat-group">
            <span className="stat-group-title">{stat.label}:</span>
            <div className="stat-values">
              <span className="stat-value">Min: {stat.min}</span>
              <span className="stat-value">Max: {stat.max}</span>
              <span className="stat-value">Avg: {stat.avg}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-container">
        {plotData.timestamps.length > 0 && chartDataArray.length > 0 ? (
          <>
            {chartDataArray.map((chartData, index) => (
              <div key={index} className="chart-section">
                <Line data={chartData} options={generateChartOptions(index)} />
              </div>
            ))}
          </>
        ) : (
          <div className="empty-chart">
            <p>グラフデータがここに表示されます</p>
            <p>シリアルポートに接続して記録を開始してください</p>
            <div className="data-format-info">
              <h4>データ形式:</h4>
              <ul>
                <li>1行目: conf=0:Label1,0:Label2,1:Label3 (グラフ設定)</li>
                <li>2行目以降: CSV形式のデータ</li>
                <li>例: "123,456,0.7890"</li>
                <li>tool_modeが自動的に有効化されます</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PIDGraphPlotter;
