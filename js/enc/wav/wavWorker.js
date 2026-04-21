importScripts('../../stego.js');

let recLength = 0;
let recBuffers = [];
let sampleRate;
let metadata;

self.onmessage = function (e) {
  switch (e.data.command) {
    case 'init':
      sampleRate = e.data.config.sampleRate;
      metadata = e.data.config.metadata || null;
      recBuffers = [];
      recLength = 0;
      break;
    case 'record':
      recBuffers.push(e.data.buffer);
      recLength += e.data.buffer.length;
      break;
    case 'finish':
      sendWAV();
      break;
  }
};

function sendWAV() {
  const floats = mergeBuffers(recBuffers, recLength);
  const pcm = floatToInt16(floats);

  if (metadata) {
    try {
      Stego.embed(pcm, metadata);
    } catch (err) {
      // audio too short for metadata — encode without it
    }
  }

  const view = encodeWAV(pcm);
  const blob = new Blob([view], { type: 'audio/wav' });

  self.postMessage({ command: 'wav', buf: blob });

  recBuffers = [];
  recLength = 0;
}

function mergeBuffers(buffers, length) {
  const result = new Float32Array(length);
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    result.set(buffers[i], offset);
    offset += buffers[i].length;
  }
  return result;
}

function floatToInt16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function encodeWAV(pcm) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, pcm.length * 2, true);

  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(44 + i * 2, pcm[i], true);
  }

  return view;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
