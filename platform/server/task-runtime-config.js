'use strict';

// A code-writing run must have one shared timeout for the transport, worker,
// and its lease. A timed-out run is reconciled, never automatically replayed.
function taskExecutionTimeout(env = process.env) {
  const value = env.AINS_TASK_EXECUTION_TIMEOUT_MS;
  if (value === undefined || value === '') return 20 * 60 * 1000;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 60_000 || timeout > 60 * 60 * 1000) {
    throw new Error('INVALID_TASK_EXECUTION_TIMEOUT');
  }
  return timeout;
}

module.exports = { taskExecutionTimeout };
