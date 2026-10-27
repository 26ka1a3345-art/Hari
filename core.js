/* Crowd counter core: finds sheep-body blobs (bright spots) in a small frame,
   tracks them and counts crossings of a line. No AI model needed. */
(function (g) {
  const W = 320;
  function kernel(sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return { k, r };
  }
  function blur(src, w, h, sigma) {
    const { k, r } = kernel(sigma), tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; a += src[y * w + xx] * k[i + r]; }
      tmp[y * w + x] = a;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; a += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = a;
    }
    return out;
  }
  function maxFilter(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = -1e9;
      for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; const v = src[y * w + xx]; if (v > m) m = v; }
      tmp[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = -1e9;
      for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; const v = tmp[yy * w + x]; if (v > m) m = v; }
      out[y * w + x] = m;
    }
    return out;
  }
  // rgba: Uint8ClampedArray of a w x h frame. k = sheep size factor (1 = default)
  function detect(rgba, w, h, k) {
    const sigma = 4.5 * k, win = Math.max(2, Math.round(10 * k)), n = w * h;
    const white = new Float32Array(n);
    for (let i = 0; i < n; i++) { const r = rgba[4 * i], gg = rgba[4 * i + 1], b = rgba[4 * i + 2]; white[i] = r < gg ? (r < b ? r : b) : (gg < b ? gg : b); }
    const bl = blur(white, w, h, sigma), mx = maxFilter(bl, w, h, win);
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { s += bl[i]; s2 += bl[i] * bl[i]; }
    const mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean)), thr = mean + 0.9 * std;
    const pts = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (bl[i] === mx[i] && bl[i] > thr) pts.push([x, y]); }
    return pts;
  }
  function Tracker() { this.tracks = []; this.nid = 1; this.total = 0; this.ab = 0; this.ba = 0; }
  // pts in frame coords; vertical=false -> line is horizontal at y=lineAt
  Tracker.prototype.update = function (pts, lineAt, vertical, gate, seg) {
    const used = new Set();
    const order = pts.slice().sort((a, b) => vertical ? b[0] - a[0] : b[1] - a[1]);
    for (const [x, y] of order) {
      let best = null, bd = 1e9;
      for (const t of this.tracks) {
        if (used.has(t.id)) continue;
        const d = Math.hypot(t.x + t.vx - x, t.y + t.vy - y);
        if (d < bd) { bd = d; best = t; }
      }
      const pos = vertical ? x : y, along = vertical ? y : x;
      if (best && bd < gate) {
        const bpos = vertical ? best.x : best.y;
        if ((bpos < lineAt) !== (pos < lineAt) && !best.c && along >= seg[0] && along <= seg[1]) {
          best.c = true; this.total++; if (pos > bpos) this.ab++; else this.ba++;
        }
        best.vx = 0.5 * best.vx + 0.5 * (x - best.x); best.vy = 0.5 * best.vy + 0.5 * (y - best.y);
        best.x = x; best.y = y; best.m = 0; used.add(best.id);
      } else {
        this.tracks.push({ id: this.nid, x, y, vx: 0, vy: 0, c: false, m: 0 }); used.add(this.nid++);
      }
    }
    for (const t of this.tracks) if (!used.has(t.id)) t.m++;
    this.tracks = this.tracks.filter(t => t.m < 6);
  };
  g.Crowd = { W, detect, Tracker };
  if (typeof module !== 'undefined') module.exports = g.Crowd;
})(typeof window !== 'undefined' ? window : globalThis);
