# Record/Encode Audio from Browser

Record audio directly in the browser and encode it in multiple formats using Web APIs.

### Demo
https://welll.github.io/record-encode-audio-from-browser/

### Browser Support
- Chrome 74+
- Firefox 90+
- Safari 14.1+
- Edge 79+

### Codecs
- **WAV** - Uncompressed PCM, encoded via Web Worker
- **MP3** - 22.050 Hz, 128 kbps via ported libmp3lame (Web Worker)
- **OGG** - Vorbis/Opus via the MediaRecorder API (browser-native)

### How It Works

WAV and MP3 encoding run in Web Workers using `ScriptProcessorNode` to capture PCM samples from the Web Audio API. OGG encoding uses the browser's native `MediaRecorder` API, which selects the best available codec (`audio/ogg; codecs=vorbis` preferred, with Opus and WebM fallbacks).

### Running the Project

A local HTTP server is required — `getUserMedia` and Web Workers don't work from `file://`.

```bash
npm run serve
```

Then open http://localhost:8000/recorder.html in your browser.

### Running Tests

Tests run in Node.js (v18+) with zero dependencies, using the built-in `node:test` runner.

```bash
npm test
```

The suite includes 144 tests covering:
- **WAV encoding** — RIFF/fmt/data header structure, PCM float-to-int16 conversion, clipping, sample rates, multi-chunk merging, edge cases
- **WAV worker protocol** — message format, Blob output, multiple recording cycles, data isolation
- **MP3 worker** — Lame initialization, config forwarding, defaults, encode/finish lifecycle
- **Audio utilities** — signal generators, WAV round-trip integrity, quantization error verification

## Author
Wellington Soares

## Thanks
Based on:
- https://github.com/nusofthq/Recordmp3js
- https://github.com/akrennmair/speech-to-server
- https://github.com/remusnegrota/Recorderjs
