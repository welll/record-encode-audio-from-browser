const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  createWavWorkerSandbox,
  generateSineWave,
  generateSilence,
  generateDCOffset,
  generateImpulse,
  generateWhiteNoise,
  parseWavHeader,
  readPCMSamples,
  blobToArrayBuffer,
} = require('./helpers');

function recordAndFinish(worker, samples, sampleRate = 44100) {
  worker.send({ command: 'init', config: { sampleRate } });
  worker.send({ command: 'record', buffer: samples });
  worker.send({ command: 'finish' });
}

async function getWavOutput(worker) {
  const msg = worker.messages.find((m) => m.command === 'wav');
  assert.ok(msg, 'Expected a wav message from worker');
  const ab = await blobToArrayBuffer(msg.buf);
  return { header: parseWavHeader(ab), pcm: readPCMSamples(ab), arrayBuffer: ab };
}

describe('WAV encoding - RIFF header', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('starts with RIFF magic bytes', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.riffId, 'RIFF');
  });

  it('contains WAVE type identifier', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.waveId, 'WAVE');
  });

  it('file size field equals totalLength - 8', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.fileSize, header.totalLength - 8);
  });

  it('total file size equals 44 + numSamples * 2', async () => {
    const numSamples = 256;
    recordAndFinish(worker, generateSilence(numSamples));
    const { header } = await getWavOutput(worker);
    assert.equal(header.totalLength, 44 + numSamples * 2);
  });
});

describe('WAV encoding - fmt chunk', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('has correct fmt chunk identifier', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.fmtId, 'fmt ');
  });

  it('fmt chunk size is 16 (PCM)', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.fmtChunkSize, 16);
  });

  it('audio format is 1 (PCM)', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.audioFormat, 1);
  });

  it('channel count is 1 (mono)', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.numChannels, 1);
  });

  it('bits per sample is 16', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.bitsPerSample, 16);
  });

  it('block align is 2 (mono, 16-bit)', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.blockAlign, 2);
  });

  it('preserves sample rate 44100', async () => {
    recordAndFinish(worker, generateSilence(100), 44100);
    const { header } = await getWavOutput(worker);
    assert.equal(header.sampleRate, 44100);
  });

  it('preserves sample rate 48000', async () => {
    recordAndFinish(worker, generateSilence(100), 48000);
    const { header } = await getWavOutput(worker);
    assert.equal(header.sampleRate, 48000);
  });

  it('preserves sample rate 22050', async () => {
    recordAndFinish(worker, generateSilence(100), 22050);
    const { header } = await getWavOutput(worker);
    assert.equal(header.sampleRate, 22050);
  });

  it('preserves sample rate 96000', async () => {
    recordAndFinish(worker, generateSilence(100), 96000);
    const { header } = await getWavOutput(worker);
    assert.equal(header.sampleRate, 96000);
  });

  it('byte rate equals sampleRate * 2 (mono 16-bit)', async () => {
    const sr = 44100;
    recordAndFinish(worker, generateSilence(100), sr);
    const { header } = await getWavOutput(worker);
    assert.equal(header.byteRate, sr * 2);
  });

  it('byte rate is consistent with blockAlign * sampleRate', async () => {
    const sr = 48000;
    recordAndFinish(worker, generateSilence(100), sr);
    const { header } = await getWavOutput(worker);
    assert.equal(header.byteRate, header.blockAlign * header.sampleRate);
  });
});

describe('WAV encoding - data chunk', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('has correct data chunk identifier', async () => {
    recordAndFinish(worker, generateSilence(100));
    const { header } = await getWavOutput(worker);
    assert.equal(header.dataId, 'data');
  });

  it('data size equals numSamples * 2', async () => {
    const numSamples = 512;
    recordAndFinish(worker, generateSilence(numSamples));
    const { header } = await getWavOutput(worker);
    assert.equal(header.dataSize, numSamples * 2);
  });

  it('data size is consistent with file size', async () => {
    recordAndFinish(worker, generateSilence(200));
    const { header } = await getWavOutput(worker);
    assert.equal(header.dataSize, header.fileSize - 36);
  });
});

describe('WAV encoding - PCM conversion (float32 to int16)', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('silence (0.0) encodes to 0', async () => {
    recordAndFinish(worker, generateSilence(10));
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], 0);
    }
  });

  it('max positive (1.0) encodes to 32767', async () => {
    recordAndFinish(worker, generateDCOffset(1, 1.0));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], 32767);
  });

  it('max negative (-1.0) encodes to -32768', async () => {
    recordAndFinish(worker, generateDCOffset(1, -1.0));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], -32768);
  });

  it('clips values above 1.0 to 32767', async () => {
    recordAndFinish(worker, generateDCOffset(1, 1.5));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], 32767);
  });

  it('clips values below -1.0 to -32768', async () => {
    recordAndFinish(worker, generateDCOffset(1, -1.5));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], -32768);
  });

  it('clips extreme positive values', async () => {
    recordAndFinish(worker, generateDCOffset(1, 100.0));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], 32767);
  });

  it('clips extreme negative values', async () => {
    recordAndFinish(worker, generateDCOffset(1, -100.0));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], -32768);
  });

  it('half positive (0.5) encodes to ~16383', async () => {
    recordAndFinish(worker, generateDCOffset(1, 0.5));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], Math.floor(0.5 * 0x7fff));
  });

  it('half negative (-0.5) encodes to ~-16384', async () => {
    recordAndFinish(worker, generateDCOffset(1, -0.5));
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], Math.floor(-0.5 * 0x8000));
  });

  it('very small positive value encodes near zero', async () => {
    recordAndFinish(worker, generateDCOffset(1, 0.0001));
    const { pcm } = await getWavOutput(worker);
    assert.ok(pcm[0] >= 0 && pcm[0] <= 5);
  });

  it('very small negative value encodes near zero', async () => {
    recordAndFinish(worker, generateDCOffset(1, -0.0001));
    const { pcm } = await getWavOutput(worker);
    assert.ok(pcm[0] >= -5 && pcm[0] <= 0);
  });

  it('positive values use 0x7FFF scale', async () => {
    const value = 0.75;
    recordAndFinish(worker, generateDCOffset(1, value));
    const { pcm } = await getWavOutput(worker);
    const expected = Math.floor(value * 0x7fff);
    assert.equal(pcm[0], expected);
  });

  it('negative values use 0x8000 scale', async () => {
    const value = -0.75;
    recordAndFinish(worker, generateDCOffset(1, value));
    const { pcm } = await getWavOutput(worker);
    const expected = Math.floor(value * 0x8000);
    assert.equal(pcm[0], expected);
  });
});

describe('WAV encoding - signal tests', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('sine wave produces non-zero PCM with correct sample count', async () => {
    const samples = generateSineWave(440, 44100, 0.1);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, samples.length);
    const hasNonZero = pcm.some((s) => s !== 0);
    assert.ok(hasNonZero, 'Sine wave should produce non-zero samples');
  });

  it('sine wave PCM values stay within int16 range', async () => {
    const samples = generateSineWave(440, 44100, 0.5);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.ok(pcm[i] >= -32768 && pcm[i] <= 32767, `Sample ${i} out of range: ${pcm[i]}`);
    }
  });

  it('sine wave has both positive and negative samples', async () => {
    const samples = generateSineWave(440, 44100, 0.01);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    const hasPositive = pcm.some((s) => s > 0);
    const hasNegative = pcm.some((s) => s < 0);
    assert.ok(hasPositive, 'Should have positive samples');
    assert.ok(hasNegative, 'Should have negative samples');
  });

  it('impulse produces exactly one non-zero sample at position 0', async () => {
    const samples = generateImpulse(100, 0);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], 32767);
    for (let i = 1; i < pcm.length; i++) {
      assert.equal(pcm[i], 0, `Expected zero at position ${i}`);
    }
  });

  it('impulse at arbitrary position is preserved', async () => {
    const pos = 42;
    const samples = generateImpulse(100, pos);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[pos], 32767);
    assert.equal(pcm[0], 0);
    assert.equal(pcm[pos - 1], 0);
    assert.equal(pcm[pos + 1], 0);
  });

  it('DC offset produces uniform PCM values', async () => {
    const dcValue = 0.3;
    const length = 50;
    recordAndFinish(worker, generateDCOffset(length, dcValue));
    const { pcm } = await getWavOutput(worker);
    const expected = Math.floor(dcValue * 0x7fff);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], expected, `Sample ${i} mismatch`);
    }
  });

  it('white noise produces varied PCM values', async () => {
    const samples = generateWhiteNoise(1000);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    const unique = new Set(pcm);
    assert.ok(unique.size > 100, `Expected diverse values, got ${unique.size} unique`);
  });
});

describe('WAV encoding - edge cases', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('single sample recording', async () => {
    recordAndFinish(worker, new Float32Array([0.5]));
    const { header, pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, 1);
    assert.equal(header.totalLength, 44 + 2);
  });

  it('empty recording produces valid header with no data', async () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'finish' });
    const { header, pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, 0);
    assert.equal(header.totalLength, 44);
    assert.equal(header.dataSize, 0);
    assert.equal(header.riffId, 'RIFF');
  });

  it('large recording (100k samples)', async () => {
    const numSamples = 100000;
    recordAndFinish(worker, generateSilence(numSamples));
    const { header, pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, numSamples);
    assert.equal(header.dataSize, numSamples * 2);
  });

  it('all max positive samples', async () => {
    const samples = generateDCOffset(100, 1.0);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], 32767);
    }
  });

  it('all max negative samples', async () => {
    const samples = generateDCOffset(100, -1.0);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], -32768);
    }
  });

  it('alternating max positive and negative', async () => {
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      samples[i] = i % 2 === 0 ? 1.0 : -1.0;
    }
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], i % 2 === 0 ? 32767 : -32768);
    }
  });

  it('NaN input clamps to zero', async () => {
    const samples = new Float32Array([NaN, NaN, NaN]);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], 0, `NaN should clamp to 0 at index ${i}`);
    }
  });

  it('Infinity clamps to max positive', async () => {
    const samples = new Float32Array([Infinity]);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], 32767);
  });

  it('-Infinity clamps to max negative', async () => {
    const samples = new Float32Array([-Infinity]);
    recordAndFinish(worker, samples);
    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm[0], -32768);
  });
});

describe('WAV encoding - multi-chunk recording', () => {
  let worker;

  beforeEach(() => {
    worker = createWavWorkerSandbox();
  });

  it('merges two chunks correctly', async () => {
    const chunk1 = generateDCOffset(50, 0.5);
    const chunk2 = generateDCOffset(50, -0.5);
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: chunk1 });
    worker.send({ command: 'record', buffer: chunk2 });
    worker.send({ command: 'finish' });

    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, 100);
    assert.equal(pcm[0], Math.floor(0.5 * 0x7fff));
    assert.equal(pcm[49], Math.floor(0.5 * 0x7fff));
    assert.equal(pcm[50], Math.floor(-0.5 * 0x8000));
    assert.equal(pcm[99], Math.floor(-0.5 * 0x8000));
  });

  it('merges many small chunks', async () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    for (let i = 0; i < 100; i++) {
      worker.send({ command: 'record', buffer: new Float32Array([i / 100]) });
    }
    worker.send({ command: 'finish' });

    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, 100);
  });

  it('merges chunks of different sizes', async () => {
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(10) });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'record', buffer: generateSilence(1) });
    worker.send({ command: 'record', buffer: generateSilence(1000) });
    worker.send({ command: 'finish' });

    const { header } = await getWavOutput(worker);
    assert.equal(header.dataSize, 1111 * 2);
  });

  it('preserves sample order across chunks', async () => {
    const chunk1 = new Float32Array([0.1, 0.2, 0.3]);
    const chunk2 = new Float32Array([0.4, 0.5]);
    const chunk3 = new Float32Array([0.6]);

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: chunk1 });
    worker.send({ command: 'record', buffer: chunk2 });
    worker.send({ command: 'record', buffer: chunk3 });
    worker.send({ command: 'finish' });

    const { pcm } = await getWavOutput(worker);
    assert.equal(pcm.length, 6);
    for (let i = 0; i < 6; i++) {
      const expected = (i + 1) * 0.1;
      const expectedPcm = Math.floor(expected * 0x7fff);
      assert.ok(
        Math.abs(pcm[i] - expectedPcm) <= 1,
        `Sample ${i}: expected ~${expectedPcm}, got ${pcm[i]}`
      );
    }
  });
});

describe('WAV encoding - sample rate combinations', () => {
  const sampleRates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000];

  for (const sr of sampleRates) {
    it(`produces valid WAV at ${sr} Hz`, async () => {
      const worker = createWavWorkerSandbox();
      const samples = generateSineWave(440, sr, 0.01);
      recordAndFinish(worker, samples, sr);
      const { header } = await getWavOutput(worker);

      assert.equal(header.sampleRate, sr);
      assert.equal(header.byteRate, sr * 2);
      assert.equal(header.riffId, 'RIFF');
      assert.equal(header.waveId, 'WAVE');
      assert.equal(header.audioFormat, 1);
    });
  }
});
