// TEMP web stub for local screenshot/dev purposes only. Not a real implementation.
const stub = {
  discoverDevices: async () => [],
  pairAndTestAtz: async () => { throw new Error('not supported on web'); },
  connectClassic: async () => { throw new Error('not supported on web'); },
  writeClassic: async () => { throw new Error('not supported on web'); },
  disconnectClassic: async () => {},
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
};

export default stub;
