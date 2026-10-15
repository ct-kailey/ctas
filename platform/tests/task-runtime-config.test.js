'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {taskExecutionTimeout} = require('../server/task-runtime-config');

test('development runtime permits a bounded longer run without accepting invalid timeout configuration', () => {
  assert.equal(taskExecutionTimeout({}), 1_200_000);
  assert.equal(taskExecutionTimeout({AINS_TASK_EXECUTION_TIMEOUT_MS:'1800000'}), 1_800_000);
  for (const value of ['0', '-1', '59999', '3600001', 'Infinity', 'no-timeout', '60000.5']) {
    assert.throws(() => taskExecutionTimeout({AINS_TASK_EXECUTION_TIMEOUT_MS:value}), /INVALID_TASK_EXECUTION_TIMEOUT/);
  }
});
