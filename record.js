/* Microphone recording via MediaRecorder.

   Why this exists: the Web Speech API is a dictation API, not a transcription one. It
   drops audio it cannot finalize, times out on silence, and never exposes the raw audio,
   so a conversation reliably loses sentences no matter how the restarts are handled.

   MediaRecorder instead captures the microphone to a file — it is a tape recorder, so
   nothing can be "missed". The complete recording then goes to the same AssemblyAI
   pipeline the Upload tab uses, which yields accurate text *and* speaker separation.

   Live captions still run alongside as a disposable preview, so there is something to
   watch while recording; the accurate transcript replaces it on stop. */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',              // Safari
  'audio/ogg;codecs=opus',
];

export function recordingSupported() {
  return typeof MediaRecorder !== 'undefined'
      && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function pickMime() {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';   // let the browser choose
}

export class Recorder {
  constructor({ onLevel, onTick, onError } = {}) {
    this.onLevel = onLevel; this.onTick = onTick; this.onError = onError;
    this.chunks = [];
    this.stream = null; this.rec = null; this.ctx = null;
    this.startedAt = 0; this.raf = 0; this.timer = 0;
  }

  get active() { return !!(this.rec && this.rec.state === 'recording'); }
  get elapsed() { return this.startedAt ? Date.now() - this.startedAt : 0; }

  async start() {
    // Echo cancellation and noise suppression help the recogniser but can clip quiet
    // speech; keep them on for calls, which is the common case.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const mimeType = pickMime();
    this.mimeType = mimeType || 'audio/webm';
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.onerror = e => this.onError?.(e.error?.message || 'Recording failed.');
    // Emit a chunk every second so a crash cannot lose the whole session.
    this.rec.start(1000);
    this.startedAt = Date.now();

    this.startMeter();
    this.timer = setInterval(() => this.onTick?.(this.elapsed), 250);
  }

  /* Resolves with the finished audio as a File, ready to upload. */
  stop() {
    return new Promise(resolve => {
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      const finish = () => {
        this.stream?.getTracks().forEach(t => t.stop());
        this.ctx?.close().catch(() => {});
        this.ctx = null; this.stream = null;
        this.onLevel?.(0);
        const blob = new Blob(this.chunks, { type: this.mimeType });
        const ext = this.mimeType.includes('mp4') ? 'm4a'
                  : this.mimeType.includes('ogg') ? 'ogg' : 'webm';
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        resolve(new File([blob], `recording-${stamp}.${ext}`, { type: this.mimeType }));
      };
      if (this.rec && this.rec.state !== 'inactive') {
        this.rec.onstop = finish;
        this.rec.stop();
      } else finish();
    });
  }

  /* Input-level meter, so the user can see the mic is live. */
  startMeter() {
    if (!this.onLevel) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(this.stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.ctx) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        this.onLevel(Math.min(1, peak / 60));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* meter is optional */ }
  }
}
