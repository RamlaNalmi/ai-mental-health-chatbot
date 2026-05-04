const Voice = {
  removeAllListeners() {},
  destroy() {
    return Promise.resolve();
  },
  onSpeechStart: undefined,
  onSpeechEnd: undefined,
  onSpeechResults: undefined,
  onSpeechError: undefined,
  start() {
    return Promise.reject(
      new Error('Voice input is not available in the web build. Use the device or emulator app.')
    );
  },
  stop() {
    return Promise.resolve();
  },
};

export default Voice;
