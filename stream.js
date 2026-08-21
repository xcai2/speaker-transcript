/* Live transcription via AssemblyAI's streaming API.

   The browser can open this WebSocket directly: WebSocket connections are not subject to
   CORS, so the API key travels as a query parameter and no backend is involved. (An earlier
   version of this project wrongly concluded streaming required a server — that was based on
   the REST token endpoint's CORS headers, which do not apply to the socket.)

   This gives the same engine that powers the Upload tab, so live text is accurate rather
   than the browser's dictation-grade guesses. Speaker separation still comes from the final
   pass over the complete recording; the streaming API labels turns, not identities. */

const ENDPOINT = 'wss://streaming.assemblyai.com/v3/ws';
const SAMPLE_RATE = 16000;

/* An AudioWorklet that converts float samples to the PCM16 the API expects. Inlined as a
   data: URL so the project stays a set of plain files with no build step. */
const FRAME_SAMPLES = 1600;   // 100ms at 16kHz — the API rejects much smaller frames

const WORKLET = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // The worklet is called every 128 samples (~8ms), which is far below the minimum
    // frame the API accepts, so buffer up to a full frame before posting.
    this.buf = new Int16Array(` + FRAME_SAMPLES + `);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 32768 : s * 32767;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.slice().buffer);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export class LiveStream {
  /* onPartial(text)  — the current in-progress turn, replaced as it updates
     onReplace(text) — better-punctuated text for the turn just emitted; revise, don't add
     onFinal(text, gapMs) — a completed turn, and the silence that preceded it. The API
                     labels turns, never identities, so that gap is the only clue available
                     live as to whether the speaker changed: a long pause usually means a
                     handover, a short one is the same person drawing breath.
     onState(state)   — 'connected' | 'closed'
     onError(message) */
  constructor({ apiKey, stream, lang, onPartial, onFinal, onReplace, onState, onError }) {
    this.apiKey = apiKey;
    this.lang = lang || 'en';
    this.stream = stream;         // reuse the recorder's MediaStream: one mic permission
    this.onPartial = onPartial; this.onFinal = onFinal; this.onReplace = onReplace;
    this.onState = onState; this.onError = onError;
    this.ws = null; this.ctx = null; this.node = null;
    this.closing = false;
    this.lastEnd = null;          // end time of the previous turn, for the gap above
    this.lastStart = null;        // audio start of the turn already emitted, to spot re-sends
  }

  async start() {
    // The streaming API takes a base language code ("en", "zh"), not a locale.
    const base = String(this.lang).split('-')[0].toLowerCase();
    const url = ENDPOINT
      + '?sample_rate=' + SAMPLE_RATE
      + '&format_turns=true'
      + '&language_code=' + encodeURIComponent(base)
      + '&token=' + encodeURIComponent(this.apiKey);

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => { this.onState?.('connected'); this.pump().catch(() => {}); };

    this.ws.onmessage = e => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.type === 'Turn' && d.transcript) {
        if (d.end_of_turn) {
          /* With format_turns=true a turn can close twice — once raw, then again with
             punctuation applied — and both copies carry end_of_turn. Emitting both would
             append every sentence twice and wreck the gap measurement, since by the second
             copy `lastEnd` already holds this turn's own end and the subtraction goes
             negative. So a repeat revises the line already shown instead of adding one.

             Word timings are in milliseconds from the start of the stream. */
          const words = d.words || [];
          const start = words.length ? words[0].start : null;

          /* Identify a repeat by where it sits on the audio timeline, not by turn_order:
             a re-send of the same turn necessarily starts at the same instant, whereas
             turn_order's increment behaviour is not something the docs pin down, and
             assuming it advances per turn is what previously left every turn after the
             first stuck as in-progress text. A turn that carries no word timings cannot be
             matched, so it is always treated as new — duplicating a line is a far smaller
             failure than never finalising one. */
          const repeat = start != null && start === this.lastStart;
          if (repeat) {
            this.onReplace?.(d.transcript);
            return;
          }

          /* The gap is measured from the end of the previous turn to the start of this one;
             the first turn has nothing to compare against and reports 0. */
          const gap = (start != null && this.lastEnd != null) ? start - this.lastEnd : 0;
          if (words.length) {
            this.lastStart = start;
            this.lastEnd = words[words.length - 1].end;
          }
          this.onFinal?.(d.transcript, Math.max(0, gap));
          this.onPartial?.('');
        }
        else this.onPartial?.(d.transcript);
      }
    };

    this.ws.onerror = () => {
      if (!this.closing) this.onError?.('Live transcription connection failed.');
    };

    this.ws.onclose = e => {
      this.onState?.('closed');
      // 4001/4003 are auth failures; anything else mid-session is a dropped connection
      if (!this.closing && e.code !== 1000) {
        this.onError?.(e.code === 4001 || e.code === 4003
          ? 'Live transcription rejected the API key.'
          : 'Live transcription disconnected.');
      }
    };
  }

  /* Feed microphone audio into the socket as PCM16 frames. */
  async pump() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(WORKLET));
    const node = new AudioWorkletNode(ctx, 'pcm-processor');
    this.node = node;
    node.port.onmessage = ev => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(ev.data);
    };
    ctx.createMediaStreamSource(this.stream).connect(node);
  }

  stop() {
    this.closing = true;
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
      }
    } catch { /* already gone */ }
    try { this.node?.disconnect(); } catch { /* not connected */ }
    this.ctx?.close().catch(() => {});
    setTimeout(() => { try { this.ws?.close(); } catch { /* already closed */ } }, 200);
    this.ctx = null; this.node = null;
  }
}
