const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Stego = require('../js/stego');
const {
  createWavWorkerSandbox,
  generateSineWave,
  generateSilence,
  generateWhiteNoise,
  blobToArrayBuffer,
  readPCMSamples,
} = require('./helpers');

function makePCM(length, value = 0) {
  const samples = new Int16Array(length);
  if (value !== 0) samples.fill(value);
  return samples;
}

function sineInt16(freq, sampleRate, duration) {
  const length = Math.floor(sampleRate * duration);
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.sin(2 * Math.PI * freq * i / sampleRate);
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return samples;
}

// --- Core embed/extract ---

describe('Stego - embed and extract', () => {
  it('round-trips a simple ASCII string', () => {
    const samples = makePCM(1000);
    Stego.embed(samples, 'hello world');
    assert.equal(Stego.extract(samples), 'hello world');
  });

  it('round-trips a single character', () => {
    const samples = makePCM(200);
    Stego.embed(samples, 'A');
    assert.equal(Stego.extract(samples), 'A');
  });

  it('round-trips a long string', () => {
    const msg = 'x'.repeat(500);
    const samples = makePCM(500 * 8 + Stego.OVERHEAD_BITS + 100);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips metadata with special characters', () => {
    const msg = 'author: John "Johnny" O\'Brien & Co. <info@test.com>';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips newlines and tabs', () => {
    const msg = 'line1\nline2\ttab';
    const samples = makePCM(1000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips JSON metadata', () => {
    const obj = { author: 'test', date: '2024-01-01', version: 3 };
    const json = JSON.stringify(obj);
    const samples = makePCM(2000);
    Stego.embed(samples, json);
    const extracted = JSON.parse(Stego.extract(samples));
    assert.deepEqual(extracted, obj);
  });

  it('round-trips URL', () => {
    const url = 'https://example.com/path?q=hello&lang=en#section';
    const samples = makePCM(2000);
    Stego.embed(samples, url);
    assert.equal(Stego.extract(samples), url);
  });
});

// --- Unicode support ---

describe('Stego - Unicode', () => {
  it('round-trips emoji', () => {
    const msg = 'Hello 🎵🎶🎤';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips CJK characters', () => {
    const msg = '你好世界';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips mixed scripts', () => {
    const msg = 'Hello мир 世界 🌍';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips accented characters', () => {
    const msg = 'café résumé naïve';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('round-trips Arabic text', () => {
    const msg = 'مرحبا بالعالم';
    const samples = makePCM(2000);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });
});

// --- Extract from non-watermarked audio ---

describe('Stego - extract from unwatermarked audio', () => {
  it('returns null for silent audio', () => {
    assert.equal(Stego.extract(makePCM(1000)), null);
  });

  it('returns null for sine wave', () => {
    assert.equal(Stego.extract(sineInt16(440, 44100, 0.1)), null);
  });

  it('returns null for audio shorter than overhead', () => {
    assert.equal(Stego.extract(makePCM(50)), null);
  });

  it('returns null for empty array', () => {
    assert.equal(Stego.extract(new Int16Array(0)), null);
  });

  it('returns null for random noise', () => {
    const noise = new Int16Array(1000);
    for (let i = 0; i < 1000; i++) {
      noise[i] = Math.floor(Math.random() * 65536) - 32768;
    }
    assert.equal(Stego.extract(noise), null);
  });

  it('returns null for all-ones LSB pattern (wrong magic)', () => {
    const samples = makePCM(1000, 0x7fff);
    assert.equal(Stego.extract(samples), null);
  });
});

// --- Capacity ---

describe('Stego - capacity', () => {
  it('returns 0 for samples shorter than overhead', () => {
    assert.equal(Stego.capacity(50), 0);
  });

  it('returns 0 for exactly overhead length', () => {
    assert.equal(Stego.capacity(Stego.OVERHEAD_BITS), 0);
  });

  it('returns 1 for overhead + 8 samples', () => {
    assert.equal(Stego.capacity(Stego.OVERHEAD_BITS + 8), 1);
  });

  it('returns correct capacity for 44100 samples (1 second)', () => {
    const cap = Stego.capacity(44100);
    assert.equal(cap, Math.floor((44100 - Stego.OVERHEAD_BITS) / 8));
    assert.ok(cap > 5000);
  });

  it('matches OVERHEAD_BITS constant of 72', () => {
    assert.equal(Stego.OVERHEAD_BITS, 72);
  });
});

// --- Error handling ---

describe('Stego - error handling', () => {
  it('throws when audio is too short for metadata', () => {
    const samples = makePCM(80);
    assert.throws(() => Stego.embed(samples, 'hello world'), /too short/i);
  });

  it('throws for metadata requiring exactly 1 more sample than available', () => {
    const msg = 'ab';
    const needed = Stego.OVERHEAD_BITS + msg.length * 8;
    const samples = makePCM(needed - 1);
    assert.throws(() => Stego.embed(samples, msg), /too short/i);
  });

  it('succeeds when samples exactly match required', () => {
    const msg = 'ab';
    const needed = Stego.OVERHEAD_BITS + new TextEncoder().encode(msg).length * 8;
    const samples = makePCM(needed);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });
});

// --- Imperceptibility ---

describe('Stego - imperceptibility', () => {
  it('changes each sample by at most 1', () => {
    const original = sineInt16(440, 44100, 0.1);
    const modified = new Int16Array(original);
    Stego.embed(modified, 'test metadata for imperceptibility check');

    for (let i = 0; i < original.length; i++) {
      const diff = Math.abs(modified[i] - original[i]);
      assert.ok(diff <= 1, `Sample ${i}: diff=${diff}, original=${original[i]}, modified=${modified[i]}`);
    }
  });

  it('only modifies samples within the payload region', () => {
    const msg = 'short';
    const payloadBits = Stego.OVERHEAD_BITS + new TextEncoder().encode(msg).length * 8;
    const original = sineInt16(440, 44100, 0.1);
    const modified = new Int16Array(original);
    Stego.embed(modified, msg);

    let changedInPayload = 0;
    let changedOutside = 0;

    for (let i = 0; i < original.length; i++) {
      if (modified[i] !== original[i]) {
        if (i < payloadBits) changedInPayload++;
        else changedOutside++;
      }
    }

    assert.equal(changedOutside, 0, 'No samples outside payload region should change');
    assert.ok(changedInPayload >= 0);
  });

  it('preserves sign of all samples', () => {
    const original = sineInt16(440, 44100, 0.5);
    const modified = new Int16Array(original);
    Stego.embed(modified, 'sign preservation test with some extra text for length');

    for (let i = 0; i < original.length; i++) {
      if (original[i] > 1) assert.ok(modified[i] > 0, `Sample ${i} sign flipped`);
      if (original[i] < -1) assert.ok(modified[i] < 0, `Sample ${i} sign flipped`);
    }
  });

  it('SNR remains very high after embedding', () => {
    const original = sineInt16(440, 44100, 1.0);
    const modified = new Int16Array(original);
    Stego.embed(modified, 'This is a longer metadata string to exercise more samples during SNR test.');

    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < original.length; i++) {
      signalPower += original[i] * original[i];
      const diff = modified[i] - original[i];
      noisePower += diff * diff;
    }

    if (noisePower === 0) return;
    const snr = 10 * Math.log10(signalPower / noisePower);
    assert.ok(snr > 80, `SNR should be > 80 dB for LSB embedding, got ${snr.toFixed(1)} dB`);
  });
});

// --- Checksum and integrity ---

describe('Stego - checksum validation', () => {
  it('detects single-bit corruption in payload', () => {
    const samples = makePCM(1000);
    Stego.embed(samples, 'integrity test');

    const payloadStart = 64;
    samples[payloadStart] ^= 1;

    assert.equal(Stego.extract(samples), null);
  });

  it('detects corruption in magic number', () => {
    const samples = makePCM(1000);
    Stego.embed(samples, 'magic test');

    samples[0] ^= 1;
    assert.equal(Stego.extract(samples), null);
  });

  it('detects corruption in length field', () => {
    const samples = makePCM(1000);
    Stego.embed(samples, 'length test');

    samples[33] ^= 1;
    assert.equal(Stego.extract(samples), null);
  });

  it('detects corruption in checksum itself', () => {
    const samples = makePCM(1000);
    const msg = 'checksum test';
    Stego.embed(samples, msg);

    const checksumStart = Stego.OVERHEAD_BITS + new TextEncoder().encode(msg).length * 8 - 8;
    samples[checksumStart] ^= 1;
    assert.equal(Stego.extract(samples), null);
  });

  it('absurdly large length field returns null', () => {
    const samples = makePCM(1000);
    Stego.embed(samples, 'test');

    for (let i = 32; i < 64; i++) {
      samples[i] = (samples[i] & ~1) | 1;
    }

    assert.equal(Stego.extract(samples), null);
  });
});

// --- Re-embedding ---

describe('Stego - re-embedding', () => {
  it('re-embedding overwrites previous metadata', () => {
    const samples = makePCM(2000);
    Stego.embed(samples, 'first message');
    Stego.embed(samples, 'second message');
    assert.equal(Stego.extract(samples), 'second message');
  });

  it('shorter re-embed still extracts correctly', () => {
    const samples = makePCM(2000);
    Stego.embed(samples, 'this is a much longer message than the next one');
    Stego.embed(samples, 'short');
    assert.equal(Stego.extract(samples), 'short');
  });

  it('longer re-embed overwrites shorter', () => {
    const samples = makePCM(2000);
    Stego.embed(samples, 'tiny');
    Stego.embed(samples, 'this is a significantly longer replacement message');
    assert.equal(Stego.extract(samples), 'this is a significantly longer replacement message');
  });
});

// --- Different audio content ---

describe('Stego - various audio content', () => {
  it('works on silence', () => {
    const samples = makePCM(1000, 0);
    Stego.embed(samples, 'silent');
    assert.equal(Stego.extract(samples), 'silent');
  });

  it('works on max positive samples', () => {
    const samples = makePCM(1000, 32767);
    Stego.embed(samples, 'max pos');
    assert.equal(Stego.extract(samples), 'max pos');
  });

  it('works on max negative samples', () => {
    const samples = makePCM(1000, -32768);
    Stego.embed(samples, 'max neg');
    assert.equal(Stego.extract(samples), 'max neg');
  });

  it('works on alternating max values', () => {
    const samples = new Int16Array(1000);
    for (let i = 0; i < 1000; i++) samples[i] = i % 2 === 0 ? 32767 : -32768;
    Stego.embed(samples, 'alternating');
    assert.equal(Stego.extract(samples), 'alternating');
  });

  it('works on sine wave', () => {
    const samples = sineInt16(440, 44100, 0.1);
    Stego.embed(samples, 'sine test');
    assert.equal(Stego.extract(samples), 'sine test');
  });

  it('works on low-frequency sine', () => {
    const samples = sineInt16(50, 44100, 0.1);
    Stego.embed(samples, 'low freq');
    assert.equal(Stego.extract(samples), 'low freq');
  });

  it('works on high-frequency sine', () => {
    const samples = sineInt16(15000, 44100, 0.1);
    Stego.embed(samples, 'high freq');
    assert.equal(Stego.extract(samples), 'high freq');
  });

  it('works on DC offset of 1', () => {
    const samples = makePCM(1000, 1);
    Stego.embed(samples, 'dc one');
    assert.equal(Stego.extract(samples), 'dc one');
  });

  it('works on DC offset of -1', () => {
    const samples = makePCM(1000, -1);
    Stego.embed(samples, 'dc neg one');
    assert.equal(Stego.extract(samples), 'dc neg one');
  });
});

// --- extractFromWav ---

describe('Stego - extractFromWav', () => {
  it('returns null for buffer too small', () => {
    assert.equal(Stego.extractFromWav(new ArrayBuffer(10)), null);
  });

  it('returns null for valid WAV without watermark', () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.1) });
    worker.send({ command: 'finish' });

    return blobToArrayBuffer(worker.messages[0].buf).then((ab) => {
      assert.equal(Stego.extractFromWav(ab), null);
    });
  });
});

// --- WAV worker integration ---

describe('Stego - WAV worker integration', () => {
  it('embeds metadata when provided in config', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'worker test' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    assert.equal(Stego.extractFromWav(ab), 'worker test');
  });

  it('does not embed when metadata is null', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: null } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.1) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    assert.equal(Stego.extractFromWav(ab), null);
  });

  it('does not embed when metadata is empty string', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: '' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.1) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    assert.equal(Stego.extractFromWav(ab), null);
  });

  it('does not embed when metadata is omitted', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.1) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    assert.equal(Stego.extractFromWav(ab), null);
  });

  it('embeds JSON metadata through worker', async () => {
    const obj = { author: 'test', timestamp: 1700000000 };
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: JSON.stringify(obj) } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    const extracted = JSON.parse(Stego.extractFromWav(ab));
    assert.deepEqual(extracted, obj);
  });

  it('embeds Unicode metadata through worker', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'Recording by 田中 🎵' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    assert.equal(Stego.extractFromWav(ab), 'Recording by 田中 🎵');
  });

  it('gracefully handles audio too short for metadata', async () => {
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'too long for tiny audio' } });
    worker.send({ command: 'record', buffer: new Float32Array([0.1, 0.2]) });
    worker.send({ command: 'finish' });

    const msg = worker.messages.find((m) => m.command === 'wav');
    assert.ok(msg, 'Should still produce WAV output');
    assert.equal(msg.buf.size, 44 + 2 * 2);
  });

  it('metadata persists across multiple recording cycles', async () => {
    const worker = createWavWorkerSandbox();

    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'recording 1' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'recording 2' } });
    worker.send({ command: 'record', buffer: generateSineWave(880, 44100, 0.5) });
    worker.send({ command: 'finish' });

    const ab1 = await blobToArrayBuffer(worker.messages[0].buf);
    const ab2 = await blobToArrayBuffer(worker.messages[1].buf);

    assert.equal(Stego.extractFromWav(ab1), 'recording 1');
    assert.equal(Stego.extractFromWav(ab2), 'recording 2');
  });

  it('can disable watermark for second recording', async () => {
    const worker = createWavWorkerSandbox();

    worker.send({ command: 'init', config: { sampleRate: 44100, metadata: 'watermarked' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    worker.send({ command: 'init', config: { sampleRate: 44100 } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 44100, 0.5) });
    worker.send({ command: 'finish' });

    const ab1 = await blobToArrayBuffer(worker.messages[0].buf);
    const ab2 = await blobToArrayBuffer(worker.messages[1].buf);

    assert.equal(Stego.extractFromWav(ab1), 'watermarked');
    assert.equal(Stego.extractFromWav(ab2), null);
  });

  it('watermarked WAV has valid header', async () => {
    const { parseWavHeader } = require('./helpers');
    const worker = createWavWorkerSandbox();
    worker.send({ command: 'init', config: { sampleRate: 48000, metadata: 'header test' } });
    worker.send({ command: 'record', buffer: generateSineWave(440, 48000, 0.5) });
    worker.send({ command: 'finish' });

    const ab = await blobToArrayBuffer(worker.messages[0].buf);
    const header = parseWavHeader(ab);

    assert.equal(header.riffId, 'RIFF');
    assert.equal(header.waveId, 'WAVE');
    assert.equal(header.audioFormat, 1);
    assert.equal(header.numChannels, 1);
    assert.equal(header.sampleRate, 48000);
    assert.equal(header.bitsPerSample, 16);
  });
});

// --- Byte-level edge cases ---

describe('Stego - byte-level edge cases', () => {
  it('handles all printable ASCII', () => {
    let msg = '';
    for (let i = 32; i < 127; i++) msg += String.fromCharCode(i);
    const samples = makePCM(msg.length * 8 + Stego.OVERHEAD_BITS + 10);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('handles null byte in UTF-8 context', () => {
    const samples = makePCM(1000);
    const msg = 'before\x00after';
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('handles maximum capacity exactly', () => {
    const numSamples = 1000;
    const cap = Stego.capacity(numSamples);
    const msg = 'A'.repeat(cap);
    const samples = makePCM(numSamples);
    Stego.embed(samples, msg);
    assert.equal(Stego.extract(samples), msg);
  });

  it('rejects one byte over capacity', () => {
    const numSamples = 1000;
    const cap = Stego.capacity(numSamples);
    const msg = 'A'.repeat(cap + 1);
    const samples = makePCM(numSamples);
    assert.throws(() => Stego.embed(samples, msg), /too short/i);
  });
});
