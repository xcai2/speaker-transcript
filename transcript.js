/* Transcript shaping and export formats.
   Mirrors the logic in transcribe.py so both paths produce identical output. */

const SENTENCE_END = '。！？…!?';
const PAUSE_MS = 800;

// AssemblyAI treats each Chinese character as its own word; drop spaces between them.
export function fixSpaces(s) {
  s = s.replace(/([一-鿿])\s+(?=[一-鿿，。！？；：、""''）】])/g, '$1');
  s = s.replace(/([（【])\s+(?=[一-鿿])/g, '$1');
  return s.trim();
}

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// hh:mm:ss,mmm for SRT
function srtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':'
       + String(s).padStart(2, '0') + ',' + String(ms % 1000).padStart(3, '0');
}
function vttTime(ms) { return srtTime(ms).replace(',', '.'); }

// Split each speaker's turn into sentences on punctuation/pauses, keeping timestamps.
export function splitIntoSegments(utterances) {
  const out = [];
  for (const utt of utterances) {
    const words = utt.words || [];
    if (!words.length) {
      out.push({ speaker: utt.speaker, start: utt.start, end: utt.end, text: fixSpaces(utt.text) });
      continue;
    }
    let buf = [];
    words.forEach((w, i) => {
      buf.push(w);
      const trimmed = (w.text || '').trim();
      const last = trimmed.slice(-1);
      const gap = i + 1 < words.length ? words[i + 1].start - w.end : 0;
      if (SENTENCE_END.includes(last) || gap > PAUSE_MS || i === words.length - 1) {
        const text = fixSpaces(buf.map(x => x.text).join(' '));
        if (text) out.push({ speaker: utt.speaker, start: buf[0].start, end: buf[buf.length - 1].end, text });
        buf = [];
      }
    });
  }
  return out;
}

/* ---------- export formats ----------
   `names` maps a raw speaker label (e.g. "A") to a display name. */

const nameOf = (names, spk) => (names && names[spk]) || 'Speaker ' + spk;

// Plain text grouped by consecutive same-speaker runs.
// fixSpaces runs again on the joined text: segment boundaries can fall between two Han
// characters, and those spaces are only visible once the segments are re-joined.
export function buildTxt(segments, names) {
  const lines = [];
  let curSpk = null, cur = [];
  for (const seg of segments) {
    if (seg.speaker !== curSpk) {
      if (cur.length) lines.push(nameOf(names, curSpk) + ': ' + fixSpaces(cur.join(' ')));
      curSpk = seg.speaker; cur = [seg.text];
    } else cur.push(seg.text);
  }
  if (cur.length) lines.push(nameOf(names, curSpk) + ': ' + fixSpaces(cur.join(' ')));
  return lines.join('\n\n');
}

// Markdown with a timestamp on every speaker turn.
export function buildMarkdown(segments, names, title) {
  const out = title ? ['# ' + title, ''] : [];
  let curSpk = null, cur = [], curStart = 0;
  const flush = () => {
    if (cur.length) out.push('**' + nameOf(names, curSpk) + '** `' + fmtTime(curStart) + '`  \n' + fixSpaces(cur.join(' ')) + '\n');
  };
  for (const seg of segments) {
    if (seg.speaker !== curSpk) {
      flush();
      curSpk = seg.speaker; cur = [seg.text]; curStart = seg.start;
    } else cur.push(seg.text);
  }
  flush();
  return out.join('\n');
}

// One subtitle cue per sentence — short enough to read on screen.
export function buildSrt(segments, names) {
  return segments.map((s, i) =>
    (i + 1) + '\n' + srtTime(s.start) + ' --> ' + srtTime(s.end) + '\n'
    + nameOf(names, s.speaker) + ': ' + s.text + '\n'
  ).join('\n');
}

export function buildVtt(segments, names) {
  return 'WEBVTT\n\n' + segments.map((s, i) =>
    (i + 1) + '\n' + vttTime(s.start) + ' --> ' + vttTime(s.end) + '\n'
    + nameOf(names, s.speaker) + ': ' + s.text + '\n'
  ).join('\n');
}

export function buildJson(segments, names, meta) {
  return JSON.stringify({
    ...(meta || {}),
    speakers: names || {},
    segments: segments.map(s => ({
      speaker: s.speaker,
      name: nameOf(names, s.speaker),
      start_ms: s.start,
      end_ms: s.end,
      text: s.text,
    })),
  }, null, 2);
}

// Talk-time per speaker, longest first.
export function talkTime(segments, names) {
  const totals = {};
  for (const s of segments) totals[s.speaker] = (totals[s.speaker] || 0) + (s.end - s.start);
  const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([spk, ms]) => ({ speaker: spk, name: nameOf(names, spk), ms, pct: Math.round(ms / grand * 100) }));
}
