/* Live captions using the browser's built-in speech recognition.

   Why not AssemblyAI streaming: its token endpoint sends no CORS headers, so a static page
   cannot mint a streaming token. Using it would require a backend holding a secret — which
   would end the "your audio never touches a server" guarantee. The Web Speech API is free,
   needs no key, and keeps recognition inside the browser's own stack.

   Trade-off: no speaker diarization. Live mode is for captions and notes; upload mode stays
   the path for speaker-separated transcripts. */

export function isSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/* The engine needs a secure origin. Opened from disk as file:// it fails with a bare
   'network' error that explains nothing, so detect that case before starting. */
export function secureOrigin() {
  return window.isSecureContext
      || location.protocol === 'https:'
      || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/* Chrome routes recognition through Google's servers; Firefox has no implementation. */
export function browserNote() {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'Firefox does not implement the Web Speech API. Use Chrome, Edge or Safari for live captions.';
  return '';
}

/* Newer Chrome can run recognition on-device, which works even when the cloud endpoint
   is unreachable — the usual cause of a 'network' error that isn't really the network
   (a blocking extension, a firewall rule, or regional blocking of Google services).
   Returns 'unavailable' | 'downloadable' | 'downloading' | 'available'. */
export async function localModelState(lang) {
  const C = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!C || typeof C.available !== 'function') return 'unavailable';
  try { return await C.available({ langs: [lang], processLocally: true }); }
  catch { return 'unavailable'; }
}

/* Ask Chrome to download the on-device model. Resolves true when it is ready to use. */
export async function installLocalModel(lang) {
  const C = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!C || typeof C.install !== 'function') return false;
  try { return await C.install({ langs: [lang] }); }
  catch { return false; }
}

/* Distinguish "the whole network is down" from "only the speech endpoint is blocked".
   If the page can reach the internet but recognition reports 'network', the cause is
   almost always an extension or firewall rule aimed at Google's speech service. */
export async function probeConnectivity() {
  try {
    await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' });
    return 'online';
  } catch { return 'offline'; }
}

export const LANGS = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['zh-CN', '中文 (普通话)'],
  ['zh-HK', '中文 (粤语)'],
  ['zh-TW', '中文 (台灣)'],
  ['ja-JP', '日本語'],
  ['ko-KR', '한국어'],
  ['es-ES', 'Español'],
  ['fr-FR', 'Français'],
  ['de-DE', 'Deutsch'],
];

/* A thin wrapper that keeps recognition running.

   The engine stops on its own after a pause or ~60s; `restart` on end is what turns it into
   a continuous session. `wanted` distinguishes a deliberate stop from an automatic one. */
const MAX_NET_RETRIES = 4;

export class LiveSession {
  constructor({ lang, onFinal, onInterim, onState, onError, onNotice, onLevel }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new Ctor();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = lang || 'en-US';
    this.wanted = false;
    this.running = false;
    this.startedAt = 0;
    this.netFails = 0;        // consecutive 'network' errors
    this.triedLocal = false;  // have we fallen back to the on-device model yet?
    this.canTryLocal = false; // set by the caller when a local model is installed
    this.retryAt = 0;         // earliest time the next restart may run
    this.retryTimer = null;
    this.lines = [];          // { text, at } — at = ms from session start
    this.pendingInterim = ''; // heard but not yet finalized; salvaged on restart
    this.onFinal = onFinal; this.onInterim = onInterim;
    this.onState = onState; this.onError = onError; this.onNotice = onNotice;
    this.onLevel = onLevel;

    /* Record one recognized line. Restart salvage and overlapping recognizers can both
       surface the same phrase, so drop an exact repeat of the previous line. */
    this.commit = (text, at) => {
      const clean = (text || '').trim();
      if (!clean) return;
      const prev = this.lines[this.lines.length - 1];
      if (prev && prev.text === clean) return;
      const entry = { text: clean, at: at ?? (Date.now() - this.startedAt) };
      this.lines.push(entry);
      this.onFinal?.(entry);
    };

    // Only a real result proves the service is working. onaudiostart fires whenever the
    // mic opens — including on a doomed retry — so resetting there let a permanently
    // broken connection loop forever at "1/4" and never reach the give-up path.
    this.markHealthy = () => {
      if (this.netFails) { this.netFails = 0; this.onNotice?.(''); }
    };

    this.rec.onresult = e => {
      this.markHealthy();   // recognition is genuinely working
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = (r[0] && r[0].transcript || '').trim();
        if (!text) continue;
        if (r.isFinal) {
          this.pendingInterim = '';
          this.commit(text);
        } else {
          interim += text + ' ';
        }
      }
      // Remember the latest interim text. The engine often ends a session before
      // finalizing what it heard; without this that sentence would vanish.
      this.pendingInterim = interim.trim();
      this.onInterim?.(this.pendingInterim);
    };

    this.rec.onerror = e => {
      // 'no-speech' and 'aborted' are routine during a long session
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.fail('Microphone permission denied. Allow mic access and try again.');
        return;
      }
      if (e.error === 'network') {
        // An insecure origin fails this way every time and will never recover.
        if (!secureOrigin()) {
          this.fail('Live captions need a secure origin. This page is running from '
            + location.protocol + '// — open it over https (the hosted demo) or from '
            + 'http://localhost instead.');
          return;
        }
        // Otherwise this is usually transient: the engine drops its connection between
        // restarts, especially after silence. Back off and retry rather than giving up —
        // only a sustained run of failures is worth surfacing.
        // Before burning retries on an endpoint that may be blocked outright, try
        // switching to the on-device model once — it needs no network at all.
        if (!this.triedLocal && this.canTryLocal) {
          this.triedLocal = true;
          this.onNotice?.(null, { switchingLocal: true });
          this.retryAt = Date.now() + 300;
          try { this.rec.processLocally = true; } catch { /* older Chrome */ }
          return;
        }

        this.netFails++;
        if (this.netFails <= MAX_NET_RETRIES) {
          this.onNotice?.(null, { retry: this.netFails, max: MAX_NET_RETRIES });
          // exponential-ish backoff: 1s, 2s, 4s, 8s — gives a flaky service time to
          // recover instead of hammering it, and keeps the notice readable
          this.retryAt = Date.now() + Math.min(8000, 1000 * 2 ** (this.netFails - 1));
          return;   // onend schedules the retry
        }
        this.fail(null, this.triedLocal ? 'lost-both' : 'lost');
        return;
      }
      this.onError?.('Recognition error: ' + e.error);
    };

    this.rec.onend = () => {
      // The engine ends without finalizing whatever it was mid-way through; keep it
      // rather than letting the sentence disappear at the restart boundary.
      if (this.pendingInterim) {
        this.commit(this.pendingInterim);
        this.pendingInterim = '';
        this.onInterim?.('');
      }
      if (!this.wanted) {
        if (this.running) { this.running = false; this.onState?.('stopped'); }
        return;
      }
      // The engine stops on its own after a pause or ~60s. Restart to keep the session
      // alive, waiting first if the last attempt failed so we don't spin on a hot loop.
      // Restart immediately unless a failure asked us to back off. Every restart costs
      // roughly a quarter-second during which the mic is deaf, so don't add to it.
      const wait = Math.max(0, (this.retryAt || 0) - Date.now());
      this.retryAt = 0;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        if (!this.wanted) return;
        try { this.rec.start(); } catch { /* already starting */ }
      }, wait);
    };
  }

  /* Give up for real: stop, tell the caller, and reset the button.
     `code` lets the caller substitute a localized message for a known failure. */
  fail(msg, code) {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.stopMeter();
    try { this.rec.abort(); } catch { /* not running */ }
    this.onError?.(msg, code);
    if (this.running) { this.running = false; this.onState?.('stopped'); }
  }

  start() {
    this.wanted = true;
    this.netFails = 0;
    if (!this.startedAt) this.startedAt = Date.now();
    try { this.rec.start(); this.running = true; this.onState?.('running'); }
    catch (e) { this.onError?.(e.message || String(e)); }
    this.startMeter();
  }

  /* A live input-level meter, independent of recognition. It answers the question the
     engine cannot: "is the mic actually picking me up?" — which distinguishes a bad mic
     from a recognizer that is dropping speech. */
  async startMeter() {
    if (this.meterStream || !this.onLevel) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.meterStream = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.meterCtx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.wanted) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        this.onLevel?.(Math.min(1, peak / 60));   // 0..1, ~60 is a normal speaking peak
        this.meterRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* meter is a nicety; recognition still works without it */ }
  }

  stopMeter() {
    cancelAnimationFrame(this.meterRaf);
    this.meterStream?.getTracks().forEach(t => t.stop());
    this.meterCtx?.close().catch(() => {});
    this.meterStream = null; this.meterCtx = null;
    this.onLevel?.(0);
  }

  /* Stop must always reset the UI. If the engine is mid-retry it isn't actually running,
     so rec.stop() is a no-op and no 'end' event ever arrives — previously that left the
     button stuck on "Stop listening" forever. Settle the state here instead of waiting. */
  stop() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.stopMeter();
    this.retryAt = 0;
    try { this.rec.stop(); } catch { /* not running */ }
    try { this.rec.abort(); } catch { /* not running */ }
    if (this.running) { this.running = false; this.onState?.('stopped'); }
  }

  setLang(lang) {
    this.rec.lang = lang;
    if (this.wanted) { this.rec.stop(); }  // onend restarts with the new language
  }

  /* Shape the captured lines like an upload transcript so every downstream export,
     search and summary function works unchanged. A single unnamed speaker is used,
     since this engine gives no diarization. */
  toSegments() {
    return this.lines.map(l => ({ speaker: 'A', start: l.at, end: l.at + 2000, text: l.text }));
  }
}
