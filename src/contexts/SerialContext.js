import React, { createContext, useContext } from 'react';
import { useSerial } from '../hooks/useSerial';

const SerialContext = createContext();

export const SerialProvider = ({ children }) => {
  const serialHook = useSerial();

  return (
    <SerialContext.Provider value={serialHook}>
      {children}
    </SerialContext.Provider>
  );
};

export const useSerialContext = () => {
  const context = useContext(SerialContext);
  if (!context) {
    throw new Error('useSerialContext must be used within a SerialProvider');
  }
  return context;
};
