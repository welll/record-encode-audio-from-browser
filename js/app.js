import { UI } from './ui.js';
import { AudioCapture } from './audio-capture.js';

const ui = new UI();
const capture = new AudioCapture();

let initialized = false;

async function handleRecord() {
  try {
    if (!initialized) {
      const sampleRate = await capture.init();
      ui.log(`Audio context ready (${sampleRate} Hz)`);
      initialized = true;
    }

    const statuses = capture.start();
    for (const status of statuses) {
      ui.log(status.message);
    }

    ui.setRecording(true);
    ui.log('Recording...');
  } catch (err) {
    ui.log('Error: ' + err.message);
  }
}

async function handleStop() {
  const recordings = await capture.stop();
  for (const { blob, ext } of recordings) {
    ui.log(`${ext.toUpperCase()} encoded (${(blob.size / 1024).toFixed(1)} KB)`);
    ui.addRecording(blob, ext);
  }

  ui.setFinished();
  ui.log('Stopped');
  ui.log('Refresh the page to record again.');
}

ui.onRecord(handleRecord);
ui.onStop(handleStop);
ui.log('Ready. Click Record to begin.');
