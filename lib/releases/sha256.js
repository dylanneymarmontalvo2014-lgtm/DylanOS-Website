(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DylanSha256 = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Sha256.update requiere bytes.');
  }

  function Sha256() {
    this.state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
    this.words = new Uint32Array(64);
  }

  Sha256.prototype.update = function (input) {
    if (this.finished) throw new Error('El hash ya fue finalizado.');
    var data = bytes(input), position = 0;
    this.bytesHashed += data.length;
    while (position < data.length) {
      var take = Math.min(data.length - position, 64 - this.bufferLength);
      this.buffer.set(data.subarray(position, position + take), this.bufferLength);
      this.bufferLength += take;
      position += take;
      if (this.bufferLength === 64) { this._compress(this.buffer); this.bufferLength = 0; }
    }
    return this;
  };

  Sha256.prototype._compress = function (chunk) {
    var w = this.words;
    for (var i = 0; i < 16; i++) {
      var j = i * 4;
      w[i] = ((chunk[j] << 24) | (chunk[j + 1] << 16) | (chunk[j + 2] << 8) | chunk[j + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
      var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a=this.state[0], b=this.state[1], c=this.state[2], d=this.state[3];
    var e=this.state[4], f=this.state[5], g=this.state[6], h=this.state[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    this.state[0]=(this.state[0]+a)>>>0; this.state[1]=(this.state[1]+b)>>>0;
    this.state[2]=(this.state[2]+c)>>>0; this.state[3]=(this.state[3]+d)>>>0;
    this.state[4]=(this.state[4]+e)>>>0; this.state[5]=(this.state[5]+f)>>>0;
    this.state[6]=(this.state[6]+g)>>>0; this.state[7]=(this.state[7]+h)>>>0;
  };

  Sha256.prototype.digest = function () {
    if (!this.finished) {
      var length = this.bytesHashed;
      this.buffer[this.bufferLength++] = 0x80;
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength, 64); this._compress(this.buffer); this.bufferLength = 0;
      }
      this.buffer.fill(0, this.bufferLength, 56);
      var high = Math.floor(length / 0x20000000);
      var low = (length << 3) >>> 0;
      for (var i = 0; i < 4; i++) this.buffer[56 + i] = (high >>> (24 - i * 8)) & 255;
      for (i = 0; i < 4; i++) this.buffer[60 + i] = (low >>> (24 - i * 8)) & 255;
      this._compress(this.buffer); this.finished = true;
    }
    var out = new Uint8Array(32);
    for (var n = 0; n < 8; n++) for (var k = 0; k < 4; k++) out[n * 4 + k] = (this.state[n] >>> (24 - k * 8)) & 255;
    return out;
  };

  Sha256.prototype.hex = function () {
    return Array.prototype.map.call(this.digest(), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  async function sha256Stream(stream, onProgress) {
    var hash = new Sha256(), size = 0;
    for await (var chunk of stream) {
      var value = bytes(chunk); hash.update(value); size += value.length;
      if (onProgress) onProgress(size);
    }
    return { sha256: hash.hex(), size: size };
  }

  async function sha256File(filePath, onProgress) {
    if (typeof require !== 'function') throw new Error('sha256File solo está disponible en Node.js.');
    var fs = require('node:fs');
    return sha256Stream(fs.createReadStream(filePath), onProgress);
  }

  return { Sha256: Sha256, sha256Stream: sha256Stream, sha256File: sha256File };
}));
