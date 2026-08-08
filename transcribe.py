import os
import re
import sys
import json
import html
from pathlib import Path
from dotenv import load_dotenv
import assemblyai as aai

load_dotenv(Path(__file__).parent / ".env")

if len(sys.argv) < 2:
    print("Usage: python3 transcribe.py <audio-file>")
    sys.exit(1)

AUDIO_FILE = Path(sys.argv[1])
STEM = AUDIO_FILE.stem
HTML_FILE = AUDIO_FILE.with_name(f"{STEM} - transcript.html")

# The raw transcript is embedded in this tag inside the HTML, so a re-run reads it
# back instead of paying to transcribe the same audio again.
RAW_RE = re.compile(
    r'<script id="rawdata" type="application/json">(.*?)</script>', re.DOTALL)


def fix_spaces(text: str) -> str:
    """AssemblyAI treats each Chinese character as its own word; drop the spaces between them."""
    text = re.sub(r'(?<=[一-鿿])\s+(?=[一-鿿，。！？；：、""''）】])', '', text)
    text = re.sub(r'(?<=[（【])\s+(?=[一-鿿])', '', text)
    return text.strip()


def transcribe_or_load() -> list[dict]:
    """Transcribe the audio, or read raw data back from an existing HTML page
    (avoiding a repeat transcription). Returns a list of utterances."""
    if HTML_FILE.exists():
        m = RAW_RE.search(HTML_FILE.read_text(encoding="utf-8"))
        if m:
            print(f"Found existing page, skipping transcription: {HTML_FILE.name}")
            return json.loads(m.group(1))

    aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
    print("Uploading and transcribing (this takes 5-10 minutes)...")
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(
        str(AUDIO_FILE),
        config=aai.TranscriptionConfig(
            speaker_labels=True,
            speech_models=["universal-3-pro", "universal-2"],
        ),
    )
    if transcript.error:
        print(f"Error: {transcript.error}")
        sys.exit(1)

    utterances = []
    for utt in transcript.utterances or []:
        utterances.append({
            "speaker": utt.speaker,
            "start": utt.start,
            "end": utt.end,
            "text": utt.text,
            "words": [{"text": w.text, "start": w.start, "end": w.end}
                      for w in (utt.words or [])],
        })
    return utterances


# Sentence-final punctuation: the signal that a sentence has ended
SENTENCE_END = "。！？…!?"
PAUSE_MS = 800  # a gap between words longer than this also breaks the sentence


def split_into_segments(utterances: list[dict]) -> list[dict]:
    """Split each speaker's turn into individual sentences on punctuation/pauses, keeping timestamps."""
    segments = []
    for utt in utterances:
        words = utt.get("words") or []
        if not words:
            segments.append({
                "speaker": utt["speaker"],
                "start": utt["start"], "end": utt["end"],
                "text": fix_spaces(utt["text"]),
            })
            continue

        buf = []
        for i, w in enumerate(words):
            buf.append(w)
            last_char = w["text"].strip()[-1:] if w["text"].strip() else ""
            gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 0
            if last_char in SENTENCE_END or gap > PAUSE_MS or i == len(words) - 1:
                text = fix_spaces(" ".join(x["text"] for x in buf))
                if text:
                    segments.append({
                        "speaker": utt["speaker"],
                        "start": buf[0]["start"], "end": buf[-1]["end"],
                        "text": text,
                    })
                buf = []
    return segments


def build_txt(utterances: list[dict]) -> str:
    """Build plain text grouped by speaker (served by the page's Download button)."""
    lines, cur_spk, cur = [], None, []
    for utt in utterances:
        spk = f"Speaker {utt['speaker']}"
        if spk != cur_spk:
            if cur:
                lines.append(f"{cur_spk}: {fix_spaces(' '.join(cur))}")
            cur_spk, cur = spk, [utt["text"]]
        else:
            cur.append(utt["text"])
    if cur:
        lines.append(f"{cur_spk}: {fix_spaces(' '.join(cur))}")
    return "\n\n".join(lines)


def fmt_time(ms: int) -> str:
    s = ms // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def _embed(obj) -> str:
    """Serialize to JSON safe to embed in HTML (escape < so it cannot break </script>)."""
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


def write_html(segments: list[dict], txt: str, raw: list[dict]) -> None:
    """Build the interactive transcript page: one row per sentence, each button plays
    that audio segment; the top-right button downloads the txt."""
    audio_src = html.escape(AUDIO_FILE.name)
    payload = _embed(
        [{"speaker": s["speaker"], "start": s["start"] / 1000,
          "end": s["end"] / 1000, "text": s["text"], "t": fmt_time(s["start"])}
         for s in segments])
    doc = HTML_TEMPLATE.replace("{{TITLE}}", html.escape(STEM)) \
                       .replace("{{AUDIO_SRC}}", audio_src) \
                       .replace("{{DATA}}", payload) \
                       .replace("{{TXT}}", _embed(txt)) \
                       .replace("{{TXT_NAME}}", _embed(f"{STEM} - transcript.txt")) \
                       .replace("{{RAW}}", _embed(raw))
    HTML_FILE.write_text(doc, encoding="utf-8")


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}} — Transcript</title>
<style>
  :root { --a: #2563eb; --b: #db2777; --c: #059669; --d: #d97706; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         margin: 0; background: #f6f7f9; color: #1a1a1a; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e5e7eb;
           padding: 14px 20px; display: flex; align-items: center; gap: 16px; z-index: 10; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .hint { font-size: 13px; color: #6b7280; margin-left: auto; }
  #download { flex: none; display: inline-flex; align-items: center; gap: 6px;
              cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151;
              border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 600; }
  #download:hover { background: #f3f4f6; }
  #download svg { width: 14px; height: 14px; fill: currentColor; }
  main { max-width: 820px; margin: 0 auto; padding: 20px 16px 120px; }
  .row { display: flex; gap: 12px; padding: 10px 12px; border-radius: 10px;
         align-items: flex-start; transition: background .15s; }
  .row:hover { background: #eef1f5; }
  .row.playing { background: #fff7ed; box-shadow: inset 0 0 0 1px #fed7aa; }
  .btn { flex: none; display: flex; align-items: center; gap: 6px; cursor: pointer;
         border: none; border-radius: 999px; padding: 5px 12px 5px 9px; font-size: 13px;
         font-weight: 600; color: #fff; user-select: none; }
  .btn svg { width: 13px; height: 13px; fill: currentColor; }
  .spk-A { background: var(--a); } .spk-B { background: var(--b); }
  .spk-C { background: var(--c); } .spk-D { background: var(--d); }
  .spk-E { background: #7c3aed; } .spk-F { background: #0891b2; }
  .body { flex: 1; }
  .text { font-size: 15px; line-height: 1.7; }
  .time { font-size: 11px; color: #9ca3af; margin-top: 3px; font-variant-numeric: tabular-nums; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff;
           border-top: 1px solid #e5e7eb; padding: 10px 16px; }
  footer .inner { max-width: 820px; margin: 0 auto; display: flex; align-items: center; gap: 12px; }
  audio { width: 100%; }
</style>
</head>
<body>
<header>
  <h1>{{TITLE}}</h1>
  <span class="hint">Click a speaker button to play that segment</span>
  <button id="download">
    <svg viewBox="0 0 24 24"><path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-8 4v-2h16v2H4z"/></svg>
    Download txt
  </button>
</header>
<main id="list"></main>
<footer><div class="inner">
  <audio id="audio" src="{{AUDIO_SRC}}" controls preload="metadata"></audio>
</div></footer>
<script id="rawdata" type="application/json">{{RAW}}</script>
<script>
const DATA = {{DATA}};
const TXT = {{TXT}};
const TXT_NAME = {{TXT_NAME}};
const audio = document.getElementById('audio');
const list = document.getElementById('list');
let stopAt = null, playingEl = null;

document.getElementById('download').onclick = () => {
  const blob = new Blob([TXT], {type: 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = TXT_NAME;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

function speakerClass(s) {
  const c = s.toUpperCase().charCodeAt(0);
  const letter = (c >= 65 && c <= 70) ? s.toUpperCase() : 'A';
  return 'spk-' + letter;
}

DATA.forEach((seg, i) => {
  const row = document.createElement('div');
  row.className = 'row';
  const btn = document.createElement('button');
  btn.className = 'btn ' + speakerClass(seg.speaker);
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' + seg.speaker;
  btn.onclick = () => play(seg, row);
  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = '<div class="text"></div><div class="time">' + seg.t + '</div>';
  body.querySelector('.text').textContent = seg.text;
  row.append(btn, body);
  list.append(row);
});

function play(seg, el) {
  if (playingEl) playingEl.classList.remove('playing');
  el.classList.add('playing');
  playingEl = el;
  stopAt = seg.end;
  audio.currentTime = seg.start;
  audio.play();
}

audio.addEventListener('timeupdate', () => {
  if (stopAt !== null && audio.currentTime >= stopAt) {
    audio.pause();
    stopAt = null;
    if (playingEl) { playingEl.classList.remove('playing'); playingEl = null; }
  }
});
audio.addEventListener('pause', () => { stopAt = null; });
</script>
</body>
</html>
"""


def main() -> None:
    utterances = transcribe_or_load()
    txt = build_txt(utterances)
    segments = split_into_segments(utterances)
    write_html(segments, txt, utterances)
    print(f"Done! Transcript page: {HTML_FILE.name}")
    print(f"  Open it in a browser; use 'Download txt' at the top right for plain text.")


if __name__ == "__main__":
    main()
