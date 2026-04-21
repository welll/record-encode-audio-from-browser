const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');

function createWavWorkerSandbox() {
  const Stego = require(join(ROOT, 'js/stego'));
  const workerCode = readFileSync(join(ROOT, 'js/enc/wav/wavWorker.js'), 'utf-8');
  const messages = [];

  const sandbox = {
    self: {
      postMessage(data) {
        messages.push(structuredClone(data));
      }
    },
    importScripts() {},
    Stego,
    Float32Array,
    DataView,
    ArrayBuffer,
    Blob,
    Int16Array,
    Uint8Array,
    Math,
    TextEncoder,
    TextDecoder,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(workerCode, sandbox);

  return {
    send(data) {
      sandbox.self.onmessage({ data });
    },
    get messages() {
      return messages;
    },
    clearMessages() {
      messages.length = 0;
    },
  };
}

function createMp3WorkerSandbox() {
  const code = readFileSync(join(ROOT, 'js/enc/mp3/mp3Worker.js'), 'utf-8');
  const messages = [];
  const lameCalls = [];
  let codecInstance = null;

  const mockLame = {
    JOINT_STEREO: 1,
    init() {
      codecInstance = { id: 'mock-codec' };
      lameCalls.push({ fn: 'init', args: [] });
      return codecInstance;
    },
    set_mode(codec, val) {
      lameCalls.push({ fn: 'set_mode', args: [val] });
    },
    set_num_channels(codec, val) {
      lameCalls.push({ fn: 'set_num_channels', args: [val] });
    },
    set_out_samplerate(codec, val) {
      lameCalls.push({ fn: 'set_out_samplerate', args: [val] });
    },
    set_in_samplerate(codec, val) {
      lameCalls.push({ fn: 'set_in_samplerate', args: [val] });
    },
    set_bitrate(codec, val) {
      lameCalls.push({ fn: 'set_bitrate', args: [val] });
    },
    init_params(codec) {
      lameCalls.push({ fn: 'init_params', args: [] });
    },
    encode_buffer_ieee_float(codec, left, right) {
      lameCalls.push({ fn: 'encode_buffer_ieee_float', args: [left.length] });
      return { data: new Float32Array(left.length) };
    },
    encode_flush(codec) {
      lameCalls.push({ fn: 'encode_flush', args: [] });
      return { data: new Float32Array(0) };
    },
    close(codec) {
      lameCalls.push({ fn: 'close', args: [] });
      codecInstance = null;
    },
  };

  const sandbox = {
    self: {
      postMessage(data) {
        messages.push(structuredClone(data));
      }
    },
    importScripts() {},
    Lame: mockLame,
    Float32Array,
    Uint8Array,
    ArrayBuffer,
    Blob,
    Math,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return {
    send(data) {
      sandbox.self.onmessage({ data });
    },
    get messages() {
      return messages;
    },
    get lameCalls() {
      return lameCalls;
    },
    clearMessages() {
      messages.length = 0;
    },
    clearLameCalls() {
      lameCalls.length = 0;
    },
  };
}

function generateSineWave(frequency, sampleRate, durationSec) {
  const length = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

function generateSilence(length) {
  return new Float32Array(length);
}

function generateDCOffset(length, value) {
  const samples = new Float32Array(length);
  samples.fill(value);
  return samples;
}

function generateImpulse(length, position = 0) {
  const samples = new Float32Array(length);
  samples[position] = 1.0;
  return samples;
}

function generateWhiteNoise(length, seed = 42) {
  const samples = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return samples;
}

function parseWavHeader(arrayBuffer) {
  const view = new DataView(arrayBuffer);

  function readString(offset, len) {
    let str = '';
    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
  }

  return {
    riffId: readString(0, 4),
    fileSize: view.getUint32(4, true),
    waveId: readString(8, 4),
    fmtId: readString(12, 4),
    fmtChunkSize: view.getUint32(16, true),
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataId: readString(36, 4),
    dataSize: view.getUint32(40, true),
    totalLength: arrayBuffer.byteLength,
  };
}

function readPCMSamples(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const numSamples = (arrayBuffer.byteLength - 44) / 2;
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = view.getInt16(44 + i * 2, true);
  }
  return samples;
}

async function blobToArrayBuffer(blob) {
  return blob.arrayBuffer();
}

module.exports = {
  createWavWorkerSandbox,
  createMp3WorkerSandbox,
  generateSineWave,
  generateSilence,
  generateDCOffset,
  generateImpulse,
  generateWhiteNoise,
  parseWavHeader,
  readPCMSamples,
  blobToArrayBuffer,
};
