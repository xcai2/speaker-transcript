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
     onFinal(text)    — a completed turn
     onState(state)   — 'connected' | 'closed'
     onError(message) */
  constructor({ apiKey, stream, lang, onPartial, onFinal, onState, onError }) {
    this.apiKey = apiKey;
    this.lang = lang || 'en';
    this.stream = stream;         // reuse the recorder's MediaStream: one mic permission
    this.onPartial = onPartial; this.onFinal = onFinal;
    this.onState = onState; this.onError = onError;
    this.ws = null; this.ctx = null; this.node = null;
    this.closing = false;
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
        if (d.end_of_turn) { this.onFinal?.(d.transcript); this.onPartial?.(''); }
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
