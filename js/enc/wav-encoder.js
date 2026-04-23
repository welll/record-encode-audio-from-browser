export class WavEncoder {
  #worker = null;
  #resolve = null;

  init(sampleRate) {
    if (!this.#worker) {
      this.#worker = new Worker('js/enc/wav/wavWorker.js');
      this.#worker.onmessage = this.#handleMessage.bind(this);
    }
    this.#worker.postMessage({ command: 'init', config: { sampleRate } });
  }

  feed(samples) {
    this.#worker?.postMessage({ command: 'record', buffer: samples });
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
    if (e.data.command === 'wav' && this.#resolve) {
      this.#resolve(e.data.buf);
      this.#resolve = null;
    }
  }
}
