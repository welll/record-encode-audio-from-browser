const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  createWavWorkerSandbox,
  generateSilence,
  generateSineWave,
  blobToArrayBuffer,
  parseWavHeader,
} = require('./helpers');

describe('WAV worker - message protocol', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('produces no output before finish', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    assert.equal(worker.messages.length, 0);
  });

  it('produces exactly one wav message on finish', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages.length, 1);
    assert.equal(worker.messages[0].command, 'wav');
  });

  it('output message contains a Blob', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'finish' });
    assert.ok(worker.messages[0].buf instanceof Blob);
  });

  it('blob has audio/wav MIME type', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages[0].buf.type, 'audio/wav');
  });

  it('blob size matches expected WAV size', () => {
    const numSamples = 256;
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(numSamples) });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages[0].buf.size, 44 + numSamples * 2);
  });
});

describe('WAV worker - multiple recording cycles', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('supports two consecutive recordings', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(200) });
    worker.send({ command: 'finish' });

    assert.equal(worker.messages.length, 2);
    assert.equal(worker.messages[0].buf.size, 44 + 100 * 2);
    assert.equal(worker.messages[1].buf.size, 44 + 200 * 2);
  });

  it('does not leak data between recordings', async () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: new Float32Array([1.0, 1.0, 1.0]) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(3) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[1].buf);
    const view = new DataView(ab);
    for (let i = 0; i < 3; i++) {
      assert.equal(view.getInt16(44 + i * 2, true), 0, `Sample ${i} should be 0 in second recording`);
    }
  });

  it('supports different sample rates across recordings', async () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(10) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { sampleRate: 48000 } });
    worker.send({ command: 'record', buffer: generateSilence(10) });
    worker.send({ command: 'finish' });

    const h1 = parseWavHeader(await blobToArrayBuffer(worker.messages[0].buf));
    const h2 = parseWavHeader(await blobToArrayBuffer(worker.messages[1].buf));
    assert.equal(h1.sampleRate, 44100);
    assert.equal(h2.sampleRate, 48000);
  });

  it('handles many consecutive recordings', () => {
    for (let i = 0; i < 20; i++) {
      worker.send({ command: 'init', config: { sampleRate: 44100 } });
      worker.send({ command: 'record', buffer: generateSilence(10) });
      worker.send({ command: 'finish' });
    }
    assert.equal(worker.messages.length, 20);
  });
});

describe('WAV worker - error resilience', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('finish without any record commands produces empty WAV', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages.length, 1);
    assert.equal(worker.messages[0].buf.size, 44);
  });

  it('handles unknown commands without crashing', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'unknown_command' });
    worker.send({ command: 'record', buffer: generateSilence(10) });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages.length, 1);
  });

  it('record with single-element buffer', () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: new Float32Array([0.5]) });
    worker.send({ command: 'finish' });
    assert.equal(worker.messages[0].buf.size, 44 + 2);
  });
});

describe('WAV worker - data integrity under load', () => {
  it('handles 4096-sample chunks (typical ScriptProcessorNode buffer)', () => {
    const worker = createWavWorkerSandbox();
    const bufferSize = 4096;
    const numChunks = 50;

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    for (let i = 0; i < numChunks; i++) {
      worker.send({ command: 'record', buffer: generateSineWave(440, 44100, bufferSize / 44100) });
    }
    worker.send({ command: 'finish' });

    const expectedSamples = bufferSize * numChunks;
    assert.equal(worker.messages[0].buf.size, 44 + expectedSamples * 2);
  });

  it('total sample count matches sum of chunks', () => {
    const worker = createWavWorkerSandbox();
    const chunkSizes = [100, 200, 300, 400, 500];
    const totalSamples = chunkSizes.reduce((a, b) => a + b, 0);

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    for (const size of chunkSizes) {
      worker.send({ command: 'record', buffer: generateSilence(size) });
    }
    worker.send({ command: 'finish' });

    assert.equal(worker.messages[0].buf.size, 44 + totalSamples * 2);
  });
});
