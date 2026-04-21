const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMp3WorkerSandbox, generateSilence, generateSineWave } = require('./helpers');

describe('MP3 worker - Lame initialization', () => {
  let worker;

  beforeEach(() => {
    worker = createMp3WorkerSandbox();
  });

  it('calls Lame.init on init command', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const initCall = worker.lameCalls.find((c) => c.fn === 'init');
    assert.ok(initCall, 'Lame.init should be called');
  });

  it('sets mode from config', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_mode');
    assert.ok(call);
    assert.equal(call.args[0], 3);
  });

  it('sets channel count from config', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_num_channels');
    assert.ok(call);
    assert.equal(call.args[0], 1);
  });

  it('sets output sample rate from config', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_out_samplerate');
    assert.ok(call);
    assert.equal(call.args[0], 22050);
  });

  it('sets input sample rate from config.insamplerate', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 48000 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_in_samplerate');
    assert.ok(call);
    assert.equal(call.args[0], 48000);
  });

  it('sets bitrate from config', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_bitrate');
    assert.ok(call);
    assert.equal(call.args[0], 128);
  });

  it('calls init_params after setting config', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const initParamsIdx = worker.lameCalls.findIndex((c) => c.fn === 'init_params');
    const setBitrateIdx = worker.lameCalls.findIndex((c) => c.fn === 'set_bitrate');
    assert.ok(initParamsIdx > setBitrateIdx, 'init_params should come after set_bitrate');
  });

  it('initialization order: init → set_* → init_params', () => {
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 128, insamplerate: 44100 }
    });
    const fns = worker.lameCalls.map((c) => c.fn);
    assert.equal(fns[0], 'init');
    assert.equal(fns[fns.length - 1], 'init_params');
  });
});

describe('MP3 worker - config defaults', () => {
  let worker;

  beforeEach(() => {
    worker = createMp3WorkerSandbox();
  });

  it('defaults mode to JOINT_STEREO when not provided', () => {
    worker.send({ command: 'init', config: {} });
    const call = worker.lameCalls.find((c) => c.fn === 'set_mode');
    assert.equal(call.args[0], 1); // JOINT_STEREO
  });

  it('defaults channels to 2 when not provided', () => {
    worker.send({ command: 'init', config: {} });
    const call = worker.lameCalls.find((c) => c.fn === 'set_num_channels');
    assert.equal(call.args[0], 2);
  });

  it('defaults output samplerate to 44100 when not provided', () => {
    worker.send({ command: 'init', config: {} });
    const call = worker.lameCalls.find((c) => c.fn === 'set_out_samplerate');
    assert.equal(call.args[0], 44100);
  });

  it('defaults input samplerate to 44100 when not provided', () => {
    worker.send({ command: 'init', config: {} });
    const call = worker.lameCalls.find((c) => c.fn === 'set_in_samplerate');
    assert.equal(call.args[0], 44100);
  });

  it('defaults bitrate to 128 when not provided', () => {
    worker.send({ command: 'init', config: {} });
    const call = worker.lameCalls.find((c) => c.fn === 'set_bitrate');
    assert.equal(call.args[0], 128);
  });

  it('handles null config by using defaults', () => {
    worker.send({ command: 'init', config: null });
    const initCall = worker.lameCalls.find((c) => c.fn === 'init');
    assert.ok(initCall);
  });

  it('handles undefined config by using defaults', () => {
    worker.send({ command: 'init' });
    const initCall = worker.lameCalls.find((c) => c.fn === 'init');
    assert.ok(initCall);
  });
});

describe('MP3 worker - insamplerate bug fix verification', () => {
  it('passes insamplerate (not in_samplerate) to Lame', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({
      command: 'init',
      config: { insamplerate: 48000 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_in_samplerate');
    assert.equal(call.args[0], 48000, 'insamplerate should be passed through correctly');
  });

  it('does not fall back to 44100 when insamplerate is provided', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({
      command: 'init',
      config: { insamplerate: 22050 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_in_samplerate');
    assert.notEqual(call.args[0], 44100);
    assert.equal(call.args[0], 22050);
  });

  it('various input sample rates are forwarded correctly', () => {
    for (const rate of [8000, 16000, 22050, 44100, 48000, 96000]) {
      const worker = createMp3WorkerSandbox();
      worker.send({ command: 'init', config: { insamplerate: rate } });
      const call = worker.lameCalls.find((c) => c.fn === 'set_in_samplerate');
      assert.equal(call.args[0], rate, `Expected ${rate} to be passed through`);
    }
  });
});

describe('MP3 worker - encode/finish lifecycle', () => {
  let worker;

  beforeEach(() => {
    worker = createMp3WorkerSandbox();
  });

  it('encode calls Lame.encode_buffer_ieee_float', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    const call = worker.lameCalls.find((c) => c.fn === 'encode_buffer_ieee_float');
    assert.ok(call);
  });

  it('finish calls Lame.encode_flush', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });
    const call = worker.lameCalls.find((c) => c.fn === 'encode_flush');
    assert.ok(call);
  });

  it('finish calls Lame.close', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });
    const call = worker.lameCalls.find((c) => c.fn === 'close');
    assert.ok(call);
  });

  it('finish produces mp3 blob message', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });
    const mp3Msg = worker.messages.find((m) => m.command === 'mp3');
    assert.ok(mp3Msg, 'Should produce mp3 message');
    assert.ok(mp3Msg.buf instanceof Blob);
  });

  it('mp3 blob has audio/mp3 MIME type', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });
    const mp3Msg = worker.messages.find((m) => m.command === 'mp3');
    assert.equal(mp3Msg.buf.type, 'audio/mp3');
  });

  it('finish also sends a data message before mp3', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });
    const dataMsg = worker.messages.find((m) => m.command === 'data');
    assert.ok(dataMsg, 'Should send data message with flush output');
  });

  it('lifecycle order: encode_flush → close', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });

    const flushIdx = worker.lameCalls.findIndex((c) => c.fn === 'encode_flush');
    const closeIdx = worker.lameCalls.findIndex((c) => c.fn === 'close');
    assert.ok(flushIdx < closeIdx, 'flush should come before close');
  });
});

describe('MP3 worker - multiple recording cycles', () => {
  let worker;

  beforeEach(() => {
    worker = createMp3WorkerSandbox();
  });

  it('supports two consecutive recordings', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(100) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(200) });
    worker.send({ command: 'finish' });

    const mp3Messages = worker.messages.filter((m) => m.command === 'mp3');
    assert.equal(mp3Messages.length, 2);
  });

  it('closes codec between recordings', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(100) });
    worker.send({ command: 'finish' });

    const closeCalls = worker.lameCalls.filter((c) => c.fn === 'close');
    assert.equal(closeCalls.length, 1);

    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(100) });
    worker.send({ command: 'finish' });

    const closeCalls2 = worker.lameCalls.filter((c) => c.fn === 'close');
    assert.equal(closeCalls2.length, 2);
  });

  it('re-initializes Lame for each recording', () => {
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'finish' });
    worker.send({ command: 'init', config: { insamplerate: 48000 } });
    worker.send({ command: 'finish' });

    const initCalls = worker.lameCalls.filter((c) => c.fn === 'init');
    assert.equal(initCalls.length, 2);
  });
});

describe('MP3 worker - multiple encode calls', () => {
  it('accumulates data across multiple encode calls', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'encode', buf: generateSilence(1024) });
    worker.send({ command: 'finish' });

    const encodeCalls = worker.lameCalls.filter((c) => c.fn === 'encode_buffer_ieee_float');
    assert.equal(encodeCalls.length, 3);
  });

  it('each encode call passes correct buffer size', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    worker.send({ command: 'encode', buf: generateSilence(512) });
    worker.send({ command: 'encode', buf: generateSilence(4096) });
    worker.send({ command: 'finish' });

    const encodeCalls = worker.lameCalls.filter((c) => c.fn === 'encode_buffer_ieee_float');
    assert.equal(encodeCalls[0].args[0], 512);
    assert.equal(encodeCalls[1].args[0], 4096);
  });

  it('handles typical ScriptProcessorNode buffer size (4096)', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({ command: 'init', config: { insamplerate: 44100 } });
    for (let i = 0; i < 100; i++) {
      worker.send({ command: 'encode', buf: generateSilence(4096) });
    }
    worker.send({ command: 'finish' });

    const encodeCalls = worker.lameCalls.filter((c) => c.fn === 'encode_buffer_ieee_float');
    assert.equal(encodeCalls.length, 100);
  });
});

describe('MP3 worker - config variations', () => {
  it('stereo mode (2 channels)', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({
      command: 'init',
      config: { channels: 2, mode: 1, samplerate: 44100, bitrate: 192, insamplerate: 44100 }
    });
    const chCall = worker.lameCalls.find((c) => c.fn === 'set_num_channels');
    assert.equal(chCall.args[0], 2);
  });

  it('low bitrate (64 kbps)', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({
      command: 'init',
      config: { channels: 1, mode: 3, samplerate: 22050, bitrate: 64, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_bitrate');
    assert.equal(call.args[0], 64);
  });

  it('high bitrate (320 kbps)', () => {
    const worker = createMp3WorkerSandbox();
    worker.send({
      command: 'init',
      config: { channels: 2, mode: 1, samplerate: 44100, bitrate: 320, insamplerate: 44100 }
    });
    const call = worker.lameCalls.find((c) => c.fn === 'set_bitrate');
    assert.equal(call.args[0], 320);
  });
});
