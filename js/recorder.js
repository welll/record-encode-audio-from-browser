(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const logEl = $('#log');
  const recordingsEl = $('#recordings');
  const btnRecord = $('#btn-record');
  const btnStop = $('#btn-stop');

  function log(msg) {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  class AudioRecorder {
    #audioContext = null;
    #stream = null;
    #sourceNode = null;
    #processorNode = null;
    #recording = false;
    #wavWorker = null;
    #mp3Worker = null;
    #mediaRecorder = null;
    #oggChunks = [];
    #activeFormats = {};

    get initialized() {
      return this.#audioContext !== null;
    }

    async init() {
      this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.#audioContext = new AudioContext();

      if (this.#audioContext.state === 'suspended') {
        await this.#audioContext.resume();
      }

      this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#stream);
      this.#processorNode = this.#audioContext.createScriptProcessor(4096, 1, 1);
      this.#processorNode.onaudioprocess = (e) => this.#onAudioProcess(e);

      this.#sourceNode.connect(this.#processorNode);
      this.#processorNode.connect(this.#audioContext.destination);

      log(`Audio context ready (${this.#audioContext.sampleRate} Hz)`);
    }

    start(formats) {
      if (this.#recording) return;
      this.#recording = true;
      this.#activeFormats = { ...formats };

      const sampleRate = this.#audioContext.sampleRate;

      if (formats.wav) {
        if (!this.#wavWorker) {
          this.#wavWorker = new Worker('js/enc/wav/wavWorker.js');
          this.#wavWorker.onmessage = (e) => {
            if (e.data.command === 'wav') this.#onEncoded(e.data.buf, 'wav');
          };
        }
        this.#wavWorker.postMessage({ command: 'init', config: { sampleRate } });
        log('WAV encoder ready');
      }

      if (formats.mp3) {
        if (!this.#mp3Worker) {
          this.#mp3Worker = new Worker('js/enc/mp3/mp3Worker.js');
          this.#mp3Worker.onmessage = (e) => {
            if (e.data.command === 'mp3') this.#onEncoded(e.data.buf, 'mp3');
          };
        }
        this.#mp3Worker.postMessage({
          command: 'init',
          config: {
            channels: 1,
            mode: 3,
            samplerate: 22050,
            bitrate: 128,
            insamplerate: sampleRate
          }
        });
        log('MP3 encoder ready (128 kbps)');
      }

      if (formats.ogg) {
        this.#startOggRecorder();
      }

      log('Recording...');
    }

    stop() {
      if (!this.#recording) return;
      this.#recording = false;

      if (this.#activeFormats.wav && this.#wavWorker) {
        this.#wavWorker.postMessage({ command: 'finish' });
      }
      if (this.#activeFormats.mp3 && this.#mp3Worker) {
        this.#mp3Worker.postMessage({ command: 'finish' });
      }
      if (this.#mediaRecorder?.state === 'recording') {
        this.#mediaRecorder.stop();
      }

      log('Stopped');
    }

    #onAudioProcess(e) {
      if (!this.#recording) return;
      const samples = e.inputBuffer.getChannelData(0);

      if (this.#activeFormats.wav && this.#wavWorker) {
        this.#wavWorker.postMessage({ command: 'record', buffer: samples });
      }
      if (this.#activeFormats.mp3 && this.#mp3Worker) {
        this.#mp3Worker.postMessage({ command: 'encode', buf: samples });
      }
    }

    #startOggRecorder() {
      const types = [
        'audio/ogg; codecs=vorbis',
        'audio/ogg; codecs=opus',
        'audio/ogg',
        'audio/webm; codecs=opus',
        'audio/webm'
      ];

      const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) {
        log('OGG: not supported in this browser');
        return;
      }

      this.#oggChunks = [];
      this.#mediaRecorder = new MediaRecorder(this.#stream, { mimeType });

      this.#mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.#oggChunks.push(e.data);
      };

      this.#mediaRecorder.onstop = () => {
        const ext = mimeType.startsWith('audio/ogg') ? 'ogg' : 'webm';
        const blob = new Blob(this.#oggChunks, { type: mimeType });
        this.#onEncoded(blob, ext);
        this.#oggChunks = [];
      };

      this.#mediaRecorder.start();
      log(`OGG encoder ready (${mimeType})`);
    }

    #onEncoded(blob, ext) {
      log(`${ext.toUpperCase()} encoded (${(blob.size / 1024).toFixed(1)} KB)`);

      const url = URL.createObjectURL(blob);
      const li = document.createElement('li');

      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.${ext}`;
      a.textContent = a.download;
      li.appendChild(a);

      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;
      li.appendChild(audio);

      recordingsEl.appendChild(li);
    }
  }

  const recorder = new AudioRecorder();

  btnRecord.addEventListener('click', async () => {
    try {
      if (!recorder.initialized) {
        await recorder.init();
      }

      const formats = {
        wav: $('#fmt-wav').checked,
        mp3: $('#fmt-mp3').checked,
        ogg: $('#fmt-ogg').checked
      };

      if (!formats.wav && !formats.mp3 && !formats.ogg) {
        log('Select at least one format');
        return;
      }

      recorder.start(formats);
      btnRecord.disabled = true;
      btnRecord.classList.add('recording');
      btnStop.disabled = false;
    } catch (err) {
      log('Error: ' + err.message);
    }
  });

  btnStop.addEventListener('click', () => {
    recorder.stop();
    btnRecord.disabled = true;
    btnRecord.classList.remove('recording');
    btnStop.disabled = true;
    log('Refresh the page to record again.');
  });

  log('Ready. Click Record to begin.');
})();
