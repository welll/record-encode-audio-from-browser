export class OggEncoder {
  #mediaRecorder = null;
  #chunks = [];
  #resolve = null;
  #mimeType = null;

  get supported() {
    return this.#mimeType !== null;
  }

  get mimeType() {
    return this.#mimeType;
  }

  get extension() {
    return this.#mimeType?.startsWith('audio/ogg') ? 'ogg' : 'webm';
  }

  init(stream) {
    const types = [
      'audio/ogg; codecs=vorbis',
      'audio/ogg; codecs=opus',
      'audio/ogg',
      'audio/webm; codecs=opus',
      'audio/webm',
    ];

    this.#mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!this.#mimeType) return false;

    this.#chunks = [];
    this.#mediaRecorder = new MediaRecorder(stream, { mimeType: this.#mimeType });

    this.#mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.#chunks.push(e.data);
    };

    this.#mediaRecorder.onstop = () => {
      const blob = new Blob(this.#chunks, { type: this.#mimeType });
      this.#chunks = [];
      if (this.#resolve) {
        this.#resolve(blob);
        this.#resolve = null;
      }
    };

    this.#mediaRecorder.start();
    return true;
  }

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
}
