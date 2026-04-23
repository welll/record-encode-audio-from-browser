export class OggEncoder {
  #mediaRecorder = null;
  #chunks = [];
  #resolve = null;
  #mimeType = null;

  get name() {
    return 'ogg';
  }

  get #extension() {
    return this.#mimeType?.startsWith('audio/ogg') ? 'ogg' : 'webm';
  }

  init({ stream }) {
    const types = [
      'audio/ogg; codecs=vorbis',
      'audio/ogg; codecs=opus',
      'audio/ogg',
      'audio/webm; codecs=opus',
      'audio/webm',
    ];

    this.#mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!this.#mimeType) {
      return { ready: false, message: 'OGG: not supported in this browser' };
    }

    this.#chunks = [];
    this.#mediaRecorder = new MediaRecorder(stream, { mimeType: this.#mimeType });
    this.#mediaRecorder.ondataavailable = this.#handleDataAvailable.bind(this);
    this.#mediaRecorder.onstop = this.#handleStop.bind(this);

    this.#mediaRecorder.start();
    return { ready: true, message: `OGG encoder ready (${this.#mimeType})` };
  }

  feed() {}

  finish() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      if (this.#mediaRecorder?.state === 'recording') {
        this.#mediaRecorder.stop();
      }
    });
  }

  destroy() {
    if (this.#mediaRecorder?.state === 'recording') {
      this.#mediaRecorder.stop();
    }
    this.#mediaRecorder = null;
  }

  #handleDataAvailable(e) {
    if (e.data.size > 0) this.#chunks.push(e.data);
  }

  #handleStop() {
    const blob = new Blob(this.#chunks, { type: this.#mimeType });
    this.#chunks = [];
    if (this.#resolve) {
      this.#resolve({ blob, ext: this.#extension });
      this.#resolve = null;
    }
  }
}
