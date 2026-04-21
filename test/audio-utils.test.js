const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateSineWave,
  generateSilence,
  generateDCOffset,
  generateImpulse,
  generateWhiteNoise,
} = require('./helpers');

describe('generateSineWave', () => {
  it('produces correct number of samples', () => {
    const samples = generateSineWave(440, 44100, 1.0);
    assert.equal(samples.length, 44100);
  });

  it('produces correct length for fractional duration', () => {
    const samples = generateSineWave(440, 44100, 0.5);
    assert.equal(samples.length, 22050);
  });

  it('starts at zero (sin(0) = 0)', () => {
    const samples = generateSineWave(440, 44100, 0.01);
    assert.ok(Math.abs(samples[0]) < 0.001);
  });

  it('values stay within [-1, 1]', () => {
    const samples = generateSineWave(440, 44100, 0.1);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(samples[i] >= -1.0 && samples[i] <= 1.0, `Sample ${i} = ${samples[i]}`);
    }
  });

  it('contains both positive and negative values', () => {
    const samples = generateSineWave(440, 44100, 0.01);
    assert.ok(samples.some((s) => s > 0));
    assert.ok(samples.some((s) => s < 0));
  });

  it('peak amplitude is approximately 1.0', () => {
    const samples = generateSineWave(440, 44100, 0.1);
    const max = Math.max(...samples);
    assert.ok(max > 0.99 && max <= 1.0, `Peak should be ~1.0, got ${max}`);
  });

  it('frequency of 0 produces all zeros', () => {
    const samples = generateSineWave(0, 44100, 0.01);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Math.abs(samples[i]) < 0.001);
    }
  });

  it('returns Float32Array', () => {
    const samples = generateSineWave(440, 44100, 0.01);
    assert.ok(samples instanceof Float32Array);
  });

  it('different frequencies produce different waveforms', () => {
    const a440 = generateSineWave(440, 44100, 0.01);
    const a880 = generateSineWave(880, 44100, 0.01);
    let differences = 0;
    for (let i = 0; i < Math.min(a440.length, a880.length); i++) {
      if (Math.abs(a440[i] - a880[i]) > 0.01) differences++;
    }
    assert.ok(differences > 0, 'Different frequencies should produce different samples');
  });
});

describe('generateSilence', () => {
  it('produces correct number of samples', () => {
    assert.equal(generateSilence(100).length, 100);
  });

  it('all samples are zero', () => {
    const samples = generateSilence(50);
    for (let i = 0; i < samples.length; i++) {
      assert.equal(samples[i], 0);
    }
  });

  it('returns Float32Array', () => {
    assert.ok(generateSilence(10) instanceof Float32Array);
  });

  it('length 0 returns empty array', () => {
    assert.equal(generateSilence(0).length, 0);
  });

  it('length 1 returns single zero', () => {
    const s = generateSilence(1);
    assert.equal(s.length, 1);
    assert.equal(s[0], 0);
  });
});

describe('generateDCOffset', () => {
  it('all samples have the specified value', () => {
    const samples = generateDCOffset(50, 0.7);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Math.abs(samples[i] - 0.7) < 0.0001);
    }
  });

  it('supports negative values', () => {
    const samples = generateDCOffset(10, -0.3);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Math.abs(samples[i] - (-0.3)) < 0.0001);
    }
  });

  it('supports zero', () => {
    const samples = generateDCOffset(10, 0);
    for (let i = 0; i < samples.length; i++) {
      assert.equal(samples[i], 0);
    }
  });

  it('supports values outside [-1, 1]', () => {
    const samples = generateDCOffset(5, 2.5);
    assert.ok(Math.abs(samples[0] - 2.5) < 0.0001);
  });

  it('returns Float32Array', () => {
    assert.ok(generateDCOffset(10, 0.5) instanceof Float32Array);
  });
});

describe('generateImpulse', () => {
  it('has 1.0 at default position 0', () => {
    const samples = generateImpulse(10);
    assert.equal(samples[0], 1.0);
  });

  it('all other samples are zero', () => {
    const samples = generateImpulse(10);
    for (let i = 1; i < samples.length; i++) {
      assert.equal(samples[i], 0);
    }
  });

  it('supports custom position', () => {
    const samples = generateImpulse(10, 5);
    assert.equal(samples[5], 1.0);
    assert.equal(samples[0], 0);
    assert.equal(samples[4], 0);
    assert.equal(samples[6], 0);
  });

  it('impulse at last position', () => {
    const samples = generateImpulse(10, 9);
    assert.equal(samples[9], 1.0);
    for (let i = 0; i < 9; i++) {
      assert.equal(samples[i], 0);
    }
  });

  it('returns Float32Array', () => {
    assert.ok(generateImpulse(10) instanceof Float32Array);
  });
});

describe('generateWhiteNoise', () => {
  it('produces correct number of samples', () => {
    assert.equal(generateWhiteNoise(100).length, 100);
  });

  it('values are within [-1, 1]', () => {
    const samples = generateWhiteNoise(10000);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(samples[i] >= -1.0 && samples[i] <= 1.0, `Sample ${i} = ${samples[i]}`);
    }
  });

  it('produces varied values', () => {
    const samples = generateWhiteNoise(1000);
    const unique = new Set();
    for (let i = 0; i < samples.length; i++) {
      unique.add(Math.round(samples[i] * 100));
    }
    assert.ok(unique.size > 50, `Expected diverse values, got ${unique.size}`);
  });

  it('same seed produces same output', () => {
    const a = generateWhiteNoise(100, 42);
    const b = generateWhiteNoise(100, 42);
    for (let i = 0; i < 100; i++) {
      assert.equal(a[i], b[i]);
    }
  });

  it('different seeds produce different output', () => {
    const a = generateWhiteNoise(100, 42);
    const b = generateWhiteNoise(100, 99);
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a[i] !== b[i]) differences++;
    }
    assert.ok(differences > 50);
  });

  it('returns Float32Array', () => {
    assert.ok(generateWhiteNoise(10) instanceof Float32Array);
  });

  it('has roughly zero mean (unbiased)', () => {
    const samples = generateWhiteNoise(10000);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i];
    }
    const mean = sum / samples.length;
    assert.ok(Math.abs(mean) < 0.1, `Mean should be near 0, got ${mean}`);
  });
});

describe('WAV round-trip integrity', () => {
  const {
    createWavWorkerSandbox,
    parseWavHeader,
    readPCMSamples,
    blobToArrayBuffer,
  } = require('./helpers');

  it('known signal survives encode → decode within quantization error', async () => {
    const worker = createWavWorkerSandbox();
    const input = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0, -0.25, -0.5, -0.75, -1.0]);

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: input });
    worker.send({ command: 'finish' });

    const msg = worker.messages.find((m) => m.command === 'wav');
    const ab = await blobToArrayBuffer(msg.buf);
    const pcm = readPCMSamples(ab);

    assert.equal(pcm.length, input.length);

    for (let i = 0; i < input.length; i++) {
      const reconstructed = pcm[i] / (pcm[i] < 0 ? 32768 : 32767);
      const error = Math.abs(reconstructed - input[i]);
      assert.ok(error < 0.001, `Sample ${i}: input=${input[i]}, reconstructed=${reconstructed}, error=${error}`);
    }
  });

  it('silence round-trips to exactly zero', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSilence(100) });
    worker.send({ command: 'finish' });

    const msg = worker.messages.find((m) => m.command === 'wav');
    const ab = await blobToArrayBuffer(msg.buf);
    const pcm = readPCMSamples(ab);

    for (let i = 0; i < pcm.length; i++) {
      assert.equal(pcm[i], 0);
    }
  });

  it('sine wave round-trip preserves frequency content', async () => {
    const worker = createWavWorkerSandbox();
    const freq = 440;
    const sr = 44100;
    const input = generateSineWave(freq, sr, 0.01);

    worker.send({ command: 'init', config: { sampleRate: sr } });
    worker.send({ command: 'record', buffer: input });
    worker.send({ command: 'finish' });

    const msg = worker.messages.find((m) => m.command === 'wav');
    const ab = await blobToArrayBuffer(msg.buf);
    const header = parseWavHeader(ab);
    const pcm = readPCMSamples(ab);

    assert.equal(header.sampleRate, sr);
    assert.equal(pcm.length, input.length);

    let zeroCrossings = 0;
    for (let i = 1; i < pcm.length; i++) {
      if ((pcm[i - 1] < 0 && pcm[i] >= 0) || (pcm[i - 1] >= 0 && pcm[i] < 0)) {
        zeroCrossings++;
      }
    }

    const expectedCrossings = Math.round(2 * freq * input.length / sr);
    const tolerance = 2;
    assert.ok(
      Math.abs(zeroCrossings - expectedCrossings) <= tolerance,
      `Expected ~${expectedCrossings} zero crossings, got ${zeroCrossings}`
    );
  });

  it('quantization error is below 16-bit threshold', async () => {
    const worker = createWavWorkerSandbox();
    const input = generateSineWave(1000, 44100, 0.1);

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: input });
    worker.send({ command: 'finish' });

    const msg = worker.messages.find((m) => m.command === 'wav');
    const ab = await blobToArrayBuffer(msg.buf);
    const pcm = readPCMSamples(ab);

    let maxError = 0;
    for (let i = 0; i < input.length; i++) {
      const reconstructed = pcm[i] / (pcm[i] < 0 ? 32768 : 32767);
      const error = Math.abs(reconstructed - input[i]);
      maxError = Math.max(maxError, error);
    }

    const quantizationStep = 1.0 / 32768;
    assert.ok(maxError < quantizationStep * 2, `Max error ${maxError} exceeds 16-bit threshold`);
  });
});
