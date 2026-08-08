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
export class LiveSession {
  constructor({ lang, onFinal, onInterim, onState, onError }) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new Ctor();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = lang || 'en-US';
    this.wanted = false;
    this.running = false;
    this.startedAt = 0;
    this.lines = [];          // { text, at } — at = ms from session start
    this.onFinal = onFinal; this.onInterim = onInterim;
    this.onState = onState; this.onError = onError;

    this.rec.onresult = e => {
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
        this.wanted = false;
        this.onError?.('Microphone permission denied. Allow mic access and try again.');
        if (this.running) { this.running = false; this.onState?.('stopped'); }
        return;
      }
      if (e.error === 'network') { this.onError?.('Network error — speech recognition needs a connection.'); return; }
      this.onError?.('Recognition error: ' + e.error);
    };

    this.rec.onend = () => {
      if (this.wanted) {
        // engine timed out; keep the session alive
        try { this.rec.start(); } catch { /* already starting */ }
      } else if (this.running) {
        this.running = false;
        this.onState?.('stopped');
      }
    };
  }

  start() {
    this.wanted = true;
    if (!this.startedAt) this.startedAt = Date.now();
    try { this.rec.start(); this.running = true; this.onState?.('running'); }
    catch (e) { this.onError?.(e.message || String(e)); }
  }

  stop() {
    this.wanted = false;
    try { this.rec.stop(); } catch { /* not running */ }
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
