'use strict';
const assert = require('assert');
const net = require('net');
const {createKrakenControlClient} = require('./receiver-sync');
const results = [];
async function run(name, options = {}) {
  const commands = [];
  const sockets = new Set();
  const live = {settings: {center_freq: 527000000, sample_rate: 2400000, gain: options.retune ? -1 : 40},
    num_channels: 5, max_elements: 5, reconfiguring: false, recovering: false,
    cooldown_active: false, operating_mode: 'coherent', noise_source: false, calibration_state: 'CONVERGED'};
  if (options.stock) {delete live.noise_source; delete live.calibration_state;}
  if (options.missingRecovery) delete live.recovering;
  if (options.kerberos) live.kerberos_mode = true;
  if (options.externalNoise) live.external_noise = true;
  if (options.malformedExternalNoise) live.external_noise = 'true';
  if (options.malformedKerberos) live.kerberos_mode = 'true';
  if (options.unknownMode) live.operating_mode = 'external';
  const send = (socket, frame) => socket.write(JSON.stringify(frame) + '\n');
  const status = socket => send(socket, live);
  const server = net.createServer(socket => {
    sockets.add(socket); socket.setEncoding('utf8'); status(socket);
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const command = JSON.parse(line); commands.push(command.command);
        if (command.command === 'get_scanner_status') {
          send(socket, {status: 'success', enabled: Boolean(options.scanning)});
        } else if (command.command === 'set_gain' || command.command === 'set_frequency') {
          const field = command.command === 'set_gain' ? 'gain' : 'frequency';
          const value = options.wrongAck ? 20 : command[field];
          send(socket, {status: 'success', [field]: value});
          live.settings[field === 'frequency' ? 'center_freq' : 'gain'] = command[field];
          // Old phase-only CONVERGED is deliberately visible before reset recovery.
          status(socket);
        } else if (command.command === 'reset_lag_compensation') {
          if (options.rejectReset) {send(socket, {status: 'error', message: 'refused'}); continue;}
          if (options.preAckRecovery) {
            live.recovering = true;
            if (!options.stock) {live.calibration_state = 'PENDING'; live.noise_source = true;}
            status(socket);
          }
          send(socket, {status: 'success', message: 'Full recalibration (lag + phase) started'});
          if (!options.noRecovery && !options.preAckRecovery) {
            live.recovering = true; live.cooldown_active = false;
            if (!options.stock) {live.calibration_state = 'PENDING'; live.noise_source = true;}
            status(socket);
          }
          setImmediate(() => {
            if (socket.destroyed) return;
            live.recovering = false;
            if (!options.stock) {live.calibration_state = options.failed ? 'FAILED' : 'CONVERGED'; live.noise_source = false;}
            if (options.modeFlip) live.operating_mode = 'wideband';
            if (options.noiseStillOn) live.noise_source = true;
            if (options.phaseNotReady) live.phase_state = 0;
            status(socket);
            if (options.failed) {live.calibration_state = 'CONVERGED'; status(socket);}
          });
        } else assert.fail(command.command);
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const candidate = {capture: {fc: options.retune ? 528000000 : 527000000, fs: 2400000,
    device: {type: 'Kraken', channel_count: 5, heimdall: {host: '127.0.0.1', control_port: port, gain: options.retune ? 'keep' : -1}}}};
  let receipt, error;
  try {receipt = await createKrakenControlClient({statusTimeoutMs: 200, readbackTimeoutMs: 100}).synchronize(candidate);}
  catch (caught) {error = caught;}
  finally {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}
  if (options.error) {
    assert.equal(error?.code, options.error, name);
    if (options.rejectReset || options.failed) {
      assert.equal(error.receiverSync.status, 'partial');
      assert.equal(error.receiverSync.operations[0].acknowledged, true);
      assert.equal(error.receiverSync.operations[0].fullRecalibration.completed, false);
    }
  } else {
    assert.ifError(error);
    assert.equal(receipt.status, 'synchronized');
    assert.deepEqual(receipt.operations[0].fullRecalibration,
      {commandSent: true, acknowledged: true, recoveryObserved: true, completed: true, verification: 'reported recovery completion; no RF measurement'});
    assert.equal(receipt.calibrationVerified, false); assert.equal(receipt.hardwareVerified, false);
  }
  const noWrite = options.missingRecovery || options.scanning || options.kerberos || options.externalNoise || options.malformedExternalNoise || options.malformedKerberos || options.unknownMode;
  assert.equal(commands.filter(c => c === 'reset_lag_compensation').length, noWrite || options.wrongAck ? 0 : 1, name);
  if (!noWrite && !options.wrongAck)
    assert.deepEqual(commands, ['get_scanner_status', options.retune ? 'set_frequency' : 'set_gain', 'reset_lag_compensation']);
  if (noWrite) assert(!commands.includes('set_gain') && !commands.includes('set_frequency'));
  results.push({case: name, passed: true, commands, error: error?.code});
}
(async () => {
  await run('patched status manual to AUTO');
  await run('stock Linux fields manual to AUTO', {stock: true});
  await run('retune already AUTO with gain keep', {stock: true, retune: true});
  await run('stale CONVERGED without recovering rejected', {noRecovery: true, error: 'KRAKEN_READBACK_TIMEOUT'});
  await run('reported noise still on refuses completion', {noiseStillOn: true, error: 'KRAKEN_READBACK_TIMEOUT'});
  await run('reported phase not ready refuses completion', {phaseNotReady: true, error: 'KRAKEN_READBACK_TIMEOUT'});
  await run('pre-ACK recovery followed by post-ACK idle cannot complete', {preAckRecovery: true, error: 'KRAKEN_READBACK_TIMEOUT'});
  await run('malformed external-noise flag refused before writes', {malformedExternalNoise: true, error: 'KRAKEN_PROTOCOL_MISMATCH'});
  await run('malformed Kerberos flag refused before writes', {malformedKerberos: true, error: 'KRAKEN_PROTOCOL_MISMATCH'});
  await run('unknown external operating mode refused before writes', {unknownMode: true, error: 'KRAKEN_PROTOCOL_MISMATCH'});
  await run('wrong gain ACK sends no reset', {wrongAck: true, error: 'KRAKEN_ACKNOWLEDGEMENT_MISMATCH'});
  await run('reset rejection preserves partial receipt', {rejectReset: true, error: 'KRAKEN_COMMAND_REJECTED'});
  await run('FAILED cannot be erased by later CONVERGED', {failed: true, error: 'KRAKEN_CALIBRATION_FAILED'});
  await run('mode change during recovery rejected', {modeFlip: true, error: 'KRAKEN_STATUS_DRIFT'});
  await run('missing recovery boolean rejected before writes', {missingRecovery: true, error: 'KRAKEN_PROTOCOL_MISMATCH'});
  await run('scanner active rejected before writes', {scanning: true, error: 'KRAKEN_RESET_UNSUPPORTED'});
  await run('Kerberos rejected before writes', {kerberos: true, error: 'KRAKEN_RESET_UNSUPPORTED'});
  await run('external noise rejected before writes', {externalNoise: true, error: 'KRAKEN_RESET_UNSUPPORTED'});
  console.log(JSON.stringify({result: 'PASS', tests: results.length, results}));
})().catch(error => {console.error(error); process.exitCode = 1;});
