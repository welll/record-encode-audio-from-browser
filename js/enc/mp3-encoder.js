export class Mp3Encoder {
  #worker = null;
  #resolve = null;

  get name() {
    return 'mp3';
  }

  init({ sampleRate }) {
    if (!this.#worker) {
      this.#worker = new Worker('js/enc/mp3/mp3Worker.js');
      this.#worker.onmessage = this.#handleMessage.bind(this);
    }
    this.#worker.postMessage({
      command: 'init',
      config: {
        channels: 1,
        mode: 3,
        samplerate: 22050,
        bitrate: 128,
        insamplerate: sampleRate,
      },
    });
    return { ready: true, message: 'MP3 encoder ready (128 kbps)' };
  }

  feed(samples) {
    this.#worker?.postMessage({ command: 'encode', buf: samples });
  }

  finish() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#worker.postMessage({ command: 'finish' });
    });
  }

  destroy() {
    this.#worker?.terminate();
    this.#worker = null;
  }

  #handleMessage(e) {
    if (e.data.command === 'mp3' && this.#resolve) {
      this.#resolve({ blob: e.data.buf, ext: 'mp3' });
      this.#resolve = null;
    }
  }
}
