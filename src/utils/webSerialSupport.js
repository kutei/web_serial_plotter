// WebSerial API support detection utility
export const WebSerialSupport = {
  // Check if WebSerial API is supported
  isSupported() {
    return typeof navigator !== 'undefined' &&
           'serial' in navigator &&
           typeof navigator.serial.requestPort === 'function';
  },

  // Get detailed support information
  getSupportInfo() {
    const hasNavigator = typeof navigator !== 'undefined';
    const hasSerial = hasNavigator && 'serial' in navigator;
    const hasRequestPort = hasSerial && typeof navigator.serial.requestPort === 'function';

    return {
      hasNavigator,
      hasSerial,
      hasRequestPort,
      isSupported: hasNavigator && hasSerial && hasRequestPort,
      userAgent: hasNavigator ? navigator.userAgent : 'Unknown',
      isHttps: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false
    };
  },

  // Get user-friendly error message
  getUnsupportedMessage() {
    const info = this.getSupportInfo();

    if (!info.hasNavigator) {
      return 'Navigator APIが利用できません。';
    }

    if (!info.hasSerial) {
      return 'WebSerial APIがサポートされていないブラウザです。Chrome、EdgeまたはWebSerial対応ブラウザをご利用ください。';
    }

    if (!info.hasRequestPort) {
      return 'WebSerial APIの機能が制限されています。ブラウザを更新するか、対応ブラウザをご利用ください。';
    }

    if (!info.isHttps && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      return 'WebSerial APIはHTTPS環境または localhost でのみ利用可能です。';
    }

    return 'WebSerial APIが利用できません。';
  }
};
