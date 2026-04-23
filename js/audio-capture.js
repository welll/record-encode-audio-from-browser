export class AudioCapture {
  #audioContext = null;
  #stream = null;
  #sourceNode = null;
  #processorNode = null;
  #onSamples = null;

  get sampleRate() {
    return this.#audioContext?.sampleRate ?? null;
  }

  get stream() {
    return this.#stream;
  }

  async init() {
    this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.#audioContext = new AudioContext();

    if (this.#audioContext.state === 'suspended') {
      await this.#audioContext.resume();
    }

    this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#stream);
    this.#processorNode = this.#audioContext.createScriptProcessor(4096, 1, 1);
    this.#processorNode.onaudioprocess = (e) => {
      if (this.#onSamples) {
        this.#onSamples(e.inputBuffer.getChannelData(0));
      }
    };

    this.#sourceNode.connect(this.#processorNode);
    this.#processorNode.connect(this.#audioContext.destination);

    return this.#audioContext.sampleRate;
  }

  start(onSamples) {
    this.#onSamples = onSamples;
  }

  stop() {
    this.#onSamples = null;
  }
}
