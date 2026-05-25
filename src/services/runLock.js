let isRunning = false;

export const acquireRunLock = () => {
  if (isRunning) return false; // already running
  isRunning = true;
  return true;
};

export const releaseRunLock = () => {
  isRunning = false;
};

export const getRunState = () => isRunning;
