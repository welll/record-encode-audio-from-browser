export class Mp3Encoder {
  #worker = null;
  #resolve = null;

  init(sampleRate) {
    if (!this.#worker) {
      this.#worker = new Worker('js/enc/mp3/mp3Worker.js');
      this.#worker.onmessage = (e) => {
        if (e.data.command === 'mp3' && this.#resolve) {
          this.#resolve(e.data.buf);
          this.#resolve = null;
        }
      };
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
}
