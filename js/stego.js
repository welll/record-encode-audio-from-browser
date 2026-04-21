(function (root) {
  'use strict';

  var MAGIC = 0x5354454e; // "STEN"
  var MAGIC_BITS = 32;
  var LENGTH_BITS = 32;
  var CHECKSUM_BITS = 8;
  var OVERHEAD_BITS = MAGIC_BITS + LENGTH_BITS + CHECKSUM_BITS; // 72

  function writeBits(samples, pos, value, numBits) {
    for (var i = 0; i < numBits; i++) {
      var bit = (value >>> (numBits - 1 - i)) & 1;
      samples[pos + i] = (samples[pos + i] & ~1) | bit;
    }
    return pos + numBits;
  }

  function readBits(samples, pos, numBits) {
    var value = 0;
    for (var i = 0; i < numBits; i++) {
      value = (value << 1) | (samples[pos + i] & 1);
    }
    return value;
  }

  function embed(samples, metadata) {
    var encoder = new TextEncoder();
    var payload = encoder.encode(metadata);
    var totalBits = OVERHEAD_BITS + payload.length * 8;

    if (totalBits > samples.length) {
      throw new Error(
        'Audio too short for metadata (' + totalBits + ' samples needed, ' + samples.length + ' available)'
      );
    }

    var pos = 0;
    pos = writeBits(samples, pos, MAGIC, MAGIC_BITS);
    pos = writeBits(samples, pos, payload.length, LENGTH_BITS);

    var checksum = 0;
    for (var i = 0; i < payload.length; i++) {
      pos = writeBits(samples, pos, payload[i], 8);
      checksum = (checksum ^ payload[i]) & 0xff;
    }

    writeBits(samples, pos, checksum, CHECKSUM_BITS);
    return samples;
  }

  function extract(samples) {
    if (samples.length < OVERHEAD_BITS) {
      return null;
    }

    var pos = 0;
    var magic = readBits(samples, pos, MAGIC_BITS);
    pos += MAGIC_BITS;

    if (magic !== MAGIC) {
      return null;
    }

    var length = readBits(samples, pos, LENGTH_BITS);
    pos += LENGTH_BITS;

    if (length <= 0 || OVERHEAD_BITS + length * 8 > samples.length) {
      return null;
    }

    var payload = new Uint8Array(length);
    var checksum = 0;
    for (var i = 0; i < length; i++) {
      payload[i] = readBits(samples, pos, 8);
      pos += 8;
      checksum = (checksum ^ payload[i]) & 0xff;
    }

    var storedChecksum = readBits(samples, pos, CHECKSUM_BITS);
    if (storedChecksum !== checksum) {
      return null;
    }

    return new TextDecoder().decode(payload);
  }

  function extractFromWav(arrayBuffer) {
    if (arrayBuffer.byteLength < 44) return null;

    var view = new DataView(arrayBuffer);
    var numSamples = (arrayBuffer.byteLength - 44) / 2;
    var samples = new Int16Array(numSamples);

    for (var i = 0; i < numSamples; i++) {
      samples[i] = view.getInt16(44 + i * 2, true);
    }

    return extract(samples);
  }

  function capacity(numSamples) {
    var availableBits = numSamples - OVERHEAD_BITS;
    return availableBits > 0 ? Math.floor(availableBits / 8) : 0;
  }

  var Stego = {
    embed: embed,
    extract: extract,
    extractFromWav: extractFromWav,
    capacity: capacity,
    OVERHEAD_BITS: OVERHEAD_BITS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Stego;
  } else {
    root.Stego = Stego;
  }
})(typeof self !== 'undefined' ? self : this);
