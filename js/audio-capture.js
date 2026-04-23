import { NoiseReducer } from './noise-reducer.js';
import { WavEncoder } from './enc/wav-encoder.js';
import { Mp3Encoder } from './enc/mp3-encoder.js';
import { OggEncoder } from './enc/ogg-encoder.js';

export class AudioCapture {
  #audioContext = null;
  #stream = null;
  #sourceNode = null;
  #processorNode = null;
  #noiseReducer = new NoiseReducer();
  #encoders = [new WavEncoder(), new Mp3Encoder(), new OggEncoder()];
  #activeEncoders = [];

  async init() {
    this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.#audioContext = new AudioContext();

    if (this.#audioContext.state === 'suspended') {
      await this.#audioContext.resume();
    }

    this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#stream);
    this.#processorNode = this.#audioContext.createScriptProcessor(4096, 1, 1);
    this.#processorNode.onaudioprocess = this.#handleAudioProcess.bind(this);

    this.#sourceNode.connect(this.#processorNode);
    this.#processorNode.connect(this.#audioContext.destination);

    return this.#audioContext.sampleRate;
  }

  start() {
    const context = {
      sampleRate: this.#audioContext.sampleRate,
      stream: this.#stream,
    };

    this.#activeEncoders = [];
    const statuses = [];

    for (const encoder of this.#encoders) {
      const status = encoder.init(context);
      statuses.push(status);
      if (status.ready) {
        this.#activeEncoders.push(encoder);
      }
    }

    return statuses;
  }

  async stop() {
    const results = await Promise.all(
      this.#activeEncoders.map((e) => e.finish())
    );
    this.#activeEncoders = [];
    return results;
  }

  #handleAudioProcess(e) {
    const raw = e.inputBuffer.getChannelData(0);
    const processed = this.#noiseReducer.process(raw);
    for (const encoder of this.#activeEncoders) {
      encoder.feed(processed);
    }
  }
}
