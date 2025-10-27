import { WebSerialSupport } from './webSerialSupport';

// WebSerial API utilities
export class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.dataCallbacks = [];
    this.statusCallbacks = [];
    this.lineBuffer = '';  // 改行コードまでのデータを蓄積するバッファ
  }

  // Check if WebSerial API is supported
  isSupported() {
    return WebSerialSupport.isSupported();
  }

  // Add data callback
  addDataCallback(callback) {
    this.dataCallbacks.push(callback);
  }

  // Remove data callback
  removeDataCallback(callback) {
    this.dataCallbacks = this.dataCallbacks.filter(cb => cb !== callback);
  }

  // Add status callback
  addStatusCallback(callback) {
    this.statusCallbacks.push(callback);
  }

  // Remove status callback
  removeStatusCallback(callback) {
    this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
  }

  // Notify all data callbacks
  notifyDataCallbacks(data) {
    this.dataCallbacks.forEach(callback => callback(data));
  }

  // Notify all status callbacks
  notifyStatusCallbacks(status) {
    this.statusCallbacks.forEach(callback => callback(status));
  }

  // Request and connect to a serial port
  async connect(options = {}) {
    if (!this.isSupported()) {
      const message = WebSerialSupport.getUnsupportedMessage();
      throw new Error(message);
    }

    try {
      // Request port selection
      this.port = await navigator.serial.requestPort();

      // Open the port with specified options
      const defaultOptions = {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      };

      await this.port.open({ ...defaultOptions, ...options });

      // Set up reader and writer
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      this.isConnected = true;
      this.notifyStatusCallbacks({ connected: true, port: this.port.getInfo() });

      // Start reading data
      this.startReading();

      return true;
    } catch (error) {
      console.error('Failed to connect to serial port:', error);
      this.notifyStatusCallbacks({ connected: false, error: error.message });
      throw error;
    }
  }

  // Disconnect from the serial port
  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }

      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }

      if (this.port) {
        await this.port.close();
        this.port = null;
      }

      this.isConnected = false;
      this.lineBuffer = '';  // Clear line buffer on disconnect
      this.notifyStatusCallbacks({ connected: false });

      return true;
    } catch (error) {
      console.error('Failed to disconnect from serial port:', error);
      throw error;
    }
  }

  // Start reading data from the serial port
  async startReading() {
    if (!this.reader) return;

    try {
      const decoder = new TextDecoder();

      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();

        if (done) {
          break;
        }

        if (value) {
          const text = decoder.decode(value);
          this.processIncomingData(text);
        }
      }
    } catch (error) {
      if (error.name !== 'NetworkError') {
        console.error('Error reading from serial port:', error);
        this.notifyStatusCallbacks({ connected: false, error: error.message });
      }
    }
  }

  // Process incoming data and emit only complete lines (ending with \n or \r\n)
  processIncomingData(data) {
    // Add new data to buffer
    this.lineBuffer += data;

    // Split by newline characters
    const lines = this.lineBuffer.split('\n');

    // If the buffer ends with \n, all lines are complete
    // Otherwise, the last element is an incomplete line
    if (this.lineBuffer.endsWith('\n') || this.lineBuffer.endsWith('\r\n')) {
      // All lines are complete, process all and clear buffer
      lines.forEach(line => {
        const trimmedLine = line.replace(/\r$/, ''); // Remove trailing \r if present
        if (trimmedLine) {
          this.notifyDataCallbacks(trimmedLine + '\n');
        }
      });
      this.lineBuffer = '';
    } else {
      // Last line is incomplete, keep it in buffer
      const completeLines = lines.slice(0, -1);
      this.lineBuffer = lines[lines.length - 1];

      completeLines.forEach(line => {
        const trimmedLine = line.replace(/\r$/, ''); // Remove trailing \r if present
        if (trimmedLine) {
          this.notifyDataCallbacks(trimmedLine + '\n');
        }
      });
    }
  }

  // Send data to the serial port
  async sendData(data, lineEnding = '\n') {
    if (!this.writer || !this.isConnected) {
      throw new Error('Serial port is not connected');
    }

    try {
      const encoder = new TextEncoder();
      const dataToSend = data + lineEnding;
      await this.writer.write(encoder.encode(dataToSend));
      return true;
    } catch (error) {
      console.error('Failed to send data:', error);
      throw error;
    }
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.port ? this.port.getInfo() : null
    };
  }
}
