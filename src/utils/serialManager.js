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
          this.notifyDataCallbacks(text);
        }
      }
    } catch (error) {
      if (error.name !== 'NetworkError') {
        console.error('Error reading from serial port:', error);
        this.notifyStatusCallbacks({ connected: false, error: error.message });
      }
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
