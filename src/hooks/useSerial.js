import { useState, useEffect, useRef } from 'react';
import { SerialManager } from '../utils/serialManager';

export const useSerial = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const serialManager = useRef(null);

  useEffect(() => {
    // Initialize SerialManager
    serialManager.current = new SerialManager();

    // Add status callback
    const statusCallback = (statusUpdate) => {
      setIsConnected(statusUpdate.connected);
      setStatus(statusUpdate);
      if (statusUpdate.error) {
        setError(statusUpdate.error);
      } else {
        setError(null);
      }
    };

    serialManager.current.addStatusCallback(statusCallback);

    // Cleanup on unmount
    return () => {
      if (serialManager.current) {
        serialManager.current.removeStatusCallback(statusCallback);
        if (serialManager.current.isConnected) {
          serialManager.current.disconnect();
        }
      }
    };
  }, []);

  const connect = async (options) => {
    try {
      setError(null);
      await serialManager.current.connect(options);
    } catch (err) {
      setError(err.message);
    }
  };

  const disconnect = async () => {
    try {
      setError(null);
      await serialManager.current.disconnect();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendData = async (data, lineEnding) => {
    try {
      setError(null);
      await serialManager.current.sendData(data, lineEnding);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const addDataCallback = (callback) => {
    serialManager.current.addDataCallback(callback);
  };

  const removeDataCallback = (callback) => {
    serialManager.current.removeDataCallback(callback);
  };

  const isSupported = () => {
    return serialManager.current ? serialManager.current.isSupported() : false;
  };

  return {
    isConnected,
    status,
    error,
    connect,
    disconnect,
    sendData,
    addDataCallback,
    removeDataCallback,
    isSupported
  };
};
