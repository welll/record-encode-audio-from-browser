import { UI } from './ui.js';
import { AudioCapture } from './audio-capture.js';
import { WavEncoder } from './enc/wav-encoder.js';
import { Mp3Encoder } from './enc/mp3-encoder.js';
import { OggEncoder } from './enc/ogg-encoder.js';

const ui = new UI();
const capture = new AudioCapture();
const encoders = {
  wav: new WavEncoder(),
  mp3: new Mp3Encoder(),
  ogg: new OggEncoder(),
};

let initialized = false;
let activeFormats = {};

ui.onRecord(async () => {
  try {
    if (!initialized) {
      const sampleRate = await capture.init();
      ui.log(`Audio context ready (${sampleRate} Hz)`);
      initialized = true;
    }

    const formats = ui.getSelectedFormats();
    if (!formats.wav && !formats.mp3 && !formats.ogg) {
      ui.log('Select at least one format');
      return;
    }

    activeFormats = { ...formats };
    const sampleRate = capture.sampleRate;

    if (formats.wav) {
      encoders.wav.init(sampleRate);
      ui.log('WAV encoder ready');
    }
    if (formats.mp3) {
      encoders.mp3.init(sampleRate);
      ui.log('MP3 encoder ready (128 kbps)');
    }
    if (formats.ogg) {
      const ok = encoders.ogg.init(capture.stream);
      if (ok) {
        ui.log(`OGG encoder ready (${encoders.ogg.mimeType})`);
      } else {
        ui.log('OGG: not supported in this browser');
        activeFormats.ogg = false;
      }
    }

    capture.start((samples) => {
      if (activeFormats.wav) encoders.wav.feed(samples);
      if (activeFormats.mp3) encoders.mp3.feed(samples);
    });

    ui.setRecording(true);
    ui.log('Recording...');
  } catch (err) {
    ui.log('Error: ' + err.message);
  }
});

ui.onStop(async () => {
  capture.stop();

  const results = [];
  if (activeFormats.wav) results.push(encoders.wav.finish().then((blob) => ({ blob, ext: 'wav' })));
  if (activeFormats.mp3) results.push(encoders.mp3.finish().then((blob) => ({ blob, ext: 'mp3' })));
  if (activeFormats.ogg) results.push(encoders.ogg.finish().then((blob) => ({ blob, ext: encoders.ogg.extension })));

  const recordings = await Promise.all(results);
  for (const { blob, ext } of recordings) {
    ui.log(`${ext.toUpperCase()} encoded (${(blob.size / 1024).toFixed(1)} KB)`);
    ui.addRecording(blob, ext);
  }

  ui.setFinished();
  ui.log('Stopped');
  ui.log('Refresh the page to record again.');
});

ui.log('Ready. Click Record to begin.');
