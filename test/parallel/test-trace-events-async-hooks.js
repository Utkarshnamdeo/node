'use strict';
const common = require('../common');
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const util = require('util');

const CODE =
  'setTimeout(() => { for (var i = 0; i < 100000; i++) { "test" + i } }, 1)';
const FILE_NAME = 'node_trace.1.log';

const tmpdir = require('../common/tmpdir');
tmpdir.refresh();
process.chdir(tmpdir.path);

const proc = cp.spawn(process.execPath,
                      [ '--trace-event-categories', 'node.async_hooks',
                        '-e', CODE ]);

proc.once('exit', common.mustCall(() => {
  assert(common.fileExists(FILE_NAME));
  fs.readFile(FILE_NAME, common.mustCall((err, data) => {
    const traces = JSON.parse(data.toString()).traceEvents;
    assert(traces.length > 0);
    // V8 trace events should be generated.
    assert(!traces.some((trace) => {
      if (trace.pid !== proc.pid)
        return false;
      if (trace.cat !== 'v8')
        return false;
      if (trace.name !== 'V8.ScriptCompiler')
        return false;
      return true;
    }));

    // C++ async_hooks trace events should be generated.
    assert(traces.some((trace) => {
      if (trace.pid !== proc.pid)
        return false;
      if (trace.cat !== 'node,node.async_hooks')
        return false;
      if (trace.name !== 'TIMERWRAP')
        return false;
      return true;
    }));

    // JavaScript async_hooks trace events should be generated.
    assert(traces.some((trace) => {
      if (trace.pid !== proc.pid)
        return false;
      if (trace.cat !== 'node,node.async_hooks')
        return false;
      if (trace.name !== 'Timeout')
        return false;
      return true;
    }));

    // Check args in init events
    const initEvents = traces.filter((trace) => {
      return (trace.ph === 'b' && !trace.name.includes('_CALLBACK'));
    });
    assert.ok(initEvents.every((trace) => {
      return (trace.args.executionAsyncId > 0 &&
              trace.args.triggerAsyncId > 0);
    }), `Unexpected initEvents format: ${util.inspect(initEvents)}`);
  }));
}));
