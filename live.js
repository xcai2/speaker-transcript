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
  constructor({ lang, onFinal, onInterim, onState, onError, onNotice }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new Ctor();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = lang || 'en-US';
    this.wanted = false;
    this.running = false;
    this.startedAt = 0;
    this.netFails = 0;        // consecutive 'network' errors
    this.retryAt = 0;         // earliest time the next restart may run
    this.retryTimer = null;
    this.lines = [];          // { text, at } — at = ms from session start
    this.onFinal = onFinal; this.onInterim = onInterim;
    this.onState = onState; this.onError = onError; this.onNotice = onNotice;

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
          const at = Date.now() - this.startedAt;
          this.lines.push({ text, at });
          this.onFinal?.({ text, at });
        } else {
          interim += text + ' ';
        }
      }
      this.onInterim?.(interim.trim());
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
        this.netFails++;
        if (this.netFails <= MAX_NET_RETRIES) {
          this.onNotice?.(null, { retry: this.netFails, max: MAX_NET_RETRIES });
          // exponential-ish backoff: 1s, 2s, 4s, 8s — gives a flaky service time to
          // recover instead of hammering it, and keeps the notice readable
          this.retryAt = Date.now() + Math.min(8000, 1000 * 2 ** (this.netFails - 1));
          return;   // onend schedules the retry
        }
        this.fail(null, 'lost');
        return;
      }
      this.onError?.('Recognition error: ' + e.error);
    };

    this.rec.onend = () => {
      if (!this.wanted) {
        if (this.running) { this.running = false; this.onState?.('stopped'); }
        return;
      }
      // The engine stops on its own after a pause or ~60s. Restart to keep the session
      // alive, waiting first if the last attempt failed so we don't spin on a hot loop.
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
  }

  /* Stop must always reset the UI. If the engine is mid-retry it isn't actually running,
     so rec.stop() is a no-op and no 'end' event ever arrives — previously that left the
     button stuck on "Stop listening" forever. Settle the state here instead of waiting. */
  stop() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
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
