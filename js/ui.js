export class UI {
  #logEl;
  #recordingsEl;
  #btnRecord;
  #btnStop;

  constructor() {
    const $ = (sel) => document.querySelector(sel);
    this.#logEl = $('#log');
    this.#recordingsEl = $('#recordings');
    this.#btnRecord = $('#btn-record');
    this.#btnStop = $('#btn-stop');
  }

  log(msg) {
    this.#logEl.textContent += msg + '\n';
    this.#logEl.scrollTop = this.#logEl.scrollHeight;
  }

  setRecording(active) {
    this.#btnRecord.disabled = active;
    this.#btnRecord.classList.toggle('recording', active);
    this.#btnStop.disabled = !active;
  }

  setFinished() {
    this.#btnRecord.disabled = true;
    this.#btnRecord.classList.remove('recording');
    this.#btnStop.disabled = true;
  }

  addRecording(blob, ext) {
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

    this.#recordingsEl.appendChild(li);
  }

  onRecord(cb) {
    this.#btnRecord.addEventListener('click', cb);
  }

  onStop(cb) {
    this.#btnStop.addEventListener('click', cb);
  }
}
