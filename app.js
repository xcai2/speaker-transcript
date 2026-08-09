import {
  splitIntoSegments, buildTxt, buildMarkdown, buildSrt, buildVtt, buildJson,
  fmtTime, talkTime,
} from './transcript.js';
import { PROVIDERS, summarize, buildPrompt, estimateTokens } from './llm.js';
import { LiveSession, isSupported as liveSupported, secureOrigin, browserNote, LANGS } from './live.js';
import { t, setLang, getLang, detectLang, apply as applyI18n } from './i18n.js';

const API = 'https://api.assemblyai.com/v2';
const $ = id => document.getElementById(id);

let picked = null;          // the File the user chose
let segments = [];          // shaped transcript
let names = {};             // speaker label -> display name
let rows = [];              // { el, seg } for search/highlight
let baseName = 'transcript';
let stopAt = null, playingEl = null;
let live = null;            // active live-caption session, if any

const audio = $('audio'), list = $('list'), statusEl = $('status');

/* ---------------- language, then the compliance notice ----------------
   The notice is legal text, so it is shown only once the interface language is settled —
   a first-time visitor picks a language and reads the notice in it. */
const langMenu = $('langmenu');
const LANG_LABEL = { en: 'English', zh: '中文' };

function applyUiLang(lang) {
  const l = setLang(lang);
  $('langcur').textContent = LANG_LABEL[l];
  for (const b of langMenu.querySelectorAll('[data-ui-lang]')) {
    b.classList.toggle('sel', b.dataset.uiLang === l);
  }
  refreshDynamicText();
}

$('langbtn').onclick = e => {
  e.stopPropagation();
  const open = langMenu.classList.toggle('open');
  $('langbtn').setAttribute('aria-expanded', String(open));
};
document.addEventListener('click', () => {
  langMenu.classList.remove('open');
  $('langbtn').setAttribute('aria-expanded', 'false');
});
for (const b of langMenu.querySelectorAll('[data-ui-lang]')) {
  b.onclick = () => {
    applyUiLang(b.dataset.uiLang);
    langMenu.classList.remove('open');
    if (!localStorage.getItem('legal_ack')) $('legal').classList.add('show');
  };
}

applyUiLang(detectLang());
if (!localStorage.getItem('legal_ack')) $('legal').classList.add('show');

$('legalok').onclick = () => {
  localStorage.setItem('legal_ack', '1');
  $('legal').classList.remove('show');
};

/* Re-render anything built in JS rather than marked up with data-i18n.
   Runs during module init as well as on later switches, so it must not touch state that
   is still being set up further down — look elements up directly, and no-op when empty. */
function refreshDynamicText() {
  const k = $('key');
  if (k) $('keynote').textContent = k.value.trim() ? t('settings.hasKey') : '';
  if ($('toggle-label')) syncSettingsToggle();
  if (segments.length) { drawRows(); drawStats(); applySearch(); }
  else $('hint').textContent = t('hint.default');
  if (live) $('livego').textContent = live.wanted ? t('live.stop') : t('live.start');
}

/* ---------------- settings: transcription key ---------------- */
const keyInput = $('key');
keyInput.value = localStorage.getItem('aai_key') || '';
if (keyInput.value) $('keynote').textContent = t('settings.hasKey');
$('savekey').onclick = () => {
  const v = keyInput.value.trim();
  if (v) { localStorage.setItem('aai_key', v); $('keynote').textContent = t('settings.saved'); }
  else { localStorage.removeItem('aai_key'); $('keynote').textContent = t('settings.cleared'); }
  refresh();
};
keyInput.oninput = refresh;

/* ---------------- settings: LLM provider ---------------- */
const provSel = $('provider'), modelSel = $('model'), llmKey = $('llmkey'), baseInput = $('baseurl');

for (const [id, p] of Object.entries(PROVIDERS)) {
  provSel.append(new Option(p.label, id));
}
provSel.value = localStorage.getItem('llm_provider') || 'openai';

function syncProvider() {
  const cfg = PROVIDERS[provSel.value];
  modelSel.textContent = '';
  for (const m of cfg.models) modelSel.append(new Option(m, m));
  // remembered model for this provider, if any
  const remembered = localStorage.getItem('llm_model_' + provSel.value);
  if (remembered) {
    if (![...modelSel.options].some(o => o.value === remembered)) modelSel.append(new Option(remembered, remembered));
    modelSel.value = remembered;
  }
  llmKey.value = localStorage.getItem('llm_key_' + provSel.value) || '';
  baseInput.value = localStorage.getItem('llm_base_' + provSel.value) || cfg.base;
  $('provnote').textContent = cfg.note || '';
  $('getkey').href = cfg.keyUrl || '#';
  $('getkey').style.display = cfg.keyUrl ? 'inline' : 'none';
  $('customwrap').style.display = provSel.value === 'custom' ? 'block' : 'none';
}
provSel.onchange = () => { localStorage.setItem('llm_provider', provSel.value); syncProvider(); };
syncProvider();

$('savellm').onclick = () => {
  const p = provSel.value;
  const k = llmKey.value.trim();
  if (k) localStorage.setItem('llm_key_' + p, k); else localStorage.removeItem('llm_key_' + p);
  localStorage.setItem('llm_model_' + p, modelSel.value);
  const b = baseInput.value.trim();
  if (b) localStorage.setItem('llm_base_' + p, b); else localStorage.removeItem('llm_base_' + p);
  $('llmnote').textContent = k ? t('settings.saved') : t('settings.cleared');
};

// let the user type a model name that isn't in the list
$('addmodel').onclick = () => {
  const m = prompt(t('settings.modelPrompt'));
  if (m) { modelSel.append(new Option(m, m)); modelSel.value = m; }
};

function syncSettingsToggle() {
  const collapsed = $('setup').classList.contains('collapsed');
  $('toggle-label').textContent = collapsed ? t('settings.show') : t('settings.hide');
  $('toggle-settings').setAttribute('aria-expanded', String(!collapsed));
  // amber until a transcription key is set, so the way in is obvious
  $('toggle-settings').classList.toggle('needskey', !$('key').value.trim());
}
$('toggle-settings').onclick = () => {
  $('setup').classList.toggle('collapsed');
  syncSettingsToggle();
};
syncSettingsToggle();

/* ---------------- file picking ---------------- */
const drop = $('drop'), fileInput = $('file');
drop.onclick = () => fileInput.click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => {
  e.preventDefault(); drop.classList.remove('over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
};
fileInput.onchange = () => { if (fileInput.files[0]) setFile(fileInput.files[0]); };

function setFile(f) {
  picked = f;
  $('fname').textContent = f.name + '  (' + (f.size / 1048576).toFixed(1) + ' MB)';
  refresh();
}
function refresh() {
  $('go').disabled = !(picked && keyInput.value.trim());
  syncSettingsToggle();
}

function say(msg, isErr) {
  statusEl.textContent = msg;
  statusEl.className = 'show' + (isErr ? ' err' : '');
}

/* ---------------- transcribe ---------------- */
$('go').onclick = async () => {
  const key = keyInput.value.trim();
  if (!picked || !key) return;
  $('go').disabled = true;
  try {
    say(t('upload.uploading') + ' ' + picked.name + '…');
    const up = await fetch(API + '/upload', {
      method: 'POST', headers: { authorization: key }, body: picked,
    });
    if (!up.ok) throw new Error('Upload failed (' + up.status + '). '
      + (up.status === 401 ? 'That API key was rejected.' : await up.text()));
    const { upload_url } = await up.json();

    say(t('upload.queued'));
    const post = await fetch(API + '/transcript', {
      method: 'POST',
      headers: { authorization: key, 'content-type': 'application/json' },
      body: JSON.stringify({
        audio_url: upload_url,
        speaker_labels: true,
        speech_models: ['universal-3-pro', 'universal-2'],
      }),
    });
    if (!post.ok) throw new Error('Could not start transcription. ' + await post.text());
    const { id } = await post.json();

    const started = Date.now();
    for (;;) {
      await new Promise(r => setTimeout(r, 4000));
      const res = await fetch(API + '/transcript/' + id, { headers: { authorization: key } });
      const job = await res.json();
      if (job.status === 'completed') { render(job); break; }
      if (job.status === 'error') throw new Error(job.error || 'Transcription failed.');
      const el = Date.now() - started;
      say(t('upload.working') + ' ' + Math.floor(el / 60000) + 'm '
        + String(Math.floor(el / 1000) % 60).padStart(2, '0') + 's ' + t('upload.elapsed'));
    }
  } catch (e) {
    say(e.message || String(e), true);
  } finally {
    $('go').disabled = false;
  }
};

/* ---------------- live captions ---------------- */
for (const [code, label] of LANGS) $('lang').append(new Option(label, code));
$('lang').value = localStorage.getItem('live_lang') || 'en-US';
$('lang').onchange = () => {
  localStorage.setItem('live_lang', $('lang').value);
  if (live) live.setLang($('lang').value);
};

function showMode(mode) {
  const up = mode === 'upload';
  $('pane-upload').style.display = up ? '' : 'none';
  $('pane-live').style.display = up ? 'none' : '';
  $('tab-upload').classList.toggle('active', up);
  $('tab-live').classList.toggle('active', !up);
  if (!up && !liveSupported()) {
    $('livego').disabled = true;
    $('livenote').className = 'note err';
    $('livenote').textContent =
      t('live.unsupported');
  }
}
$('tab-upload').onclick = () => showMode('upload');
$('tab-live').onclick = () => showMode('live');

$('livego').onclick = () => {
  // Treat any active-looking session as stoppable. Keying only off `wanted` meant a
  // session that had already given up left the button unresponsive.
  if (live && (live.wanted || live.running)) { stopLive(); return; }
  // fail early with a useful message rather than a bare 'network' error later
  if (!secureOrigin()) {
    $('livenote').className = 'note err';
    $('livenote').textContent = t('live.insecure');
    return;
  }
  const warn = browserNote();
  if (warn) { $('livenote').className = 'note err'; $('livenote').textContent = warn; return; }

  const liveText = $('livetext');
  liveText.textContent = '';
  $('interim').textContent = '';

  live = new LiveSession({
    lang: $('lang').value,
    onFinal: ({ text, at }) => {
      const p = document.createElement('p');
      const ts = document.createElement('span');
      ts.className = 'time';
      ts.textContent = fmtTime(at) + '  ';
      p.append(ts, document.createTextNode(text));
      liveText.append(p);
      $('livebox').scrollTop = $('livebox').scrollHeight;
    },
    onInterim: t => { $('interim').textContent = t; },
    onState: state => {
      const running = state === 'running';
      $('livego').classList.toggle('listening', running);
      $('livego').textContent = running ? t('live.stop') : t('live.start');
      if (running) { $('livenote').className = 'note'; $('livenote').textContent = t('live.listening'); }
    },
    onError: (msg, code) => {
      $('livenote').className = 'note err';
      $('livenote').textContent = code === 'lost' ? t('live.lost') : msg;
    },
    // transient reconnects are informational, not errors
    onNotice: (msg, info) => {
      $('livenote').className = 'note';
      $('livenote').textContent = info
        ? `${t('live.reconnecting')} (${info.retry}/${info.max})…`
        : (msg || (live && live.wanted ? t('live.listening') : ''));
    },
  });
  live.start();
  window.__live = live;   // exposed for tests
};

function stopLive() {
  if (!live) return;
  live.stop();
  $('interim').textContent = '';
  // the session is over either way — make sure the button reflects that
  $('livego').classList.remove('listening');
  $('livego').textContent = t('live.start');
  const segs = live.toSegments();
  if (!segs.length) {
    $('livenote').className = 'note';
    $('livenote').textContent = t('live.nothing');
    live = null;
    return;
  }
  // hand the captured text to the same pipeline the upload path uses
  segments = segs;
  names = { A: t('speaker.me') };
  baseName = 'live-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  audio.removeAttribute('src');
  $('player').classList.remove('show');
  $('toolbar').classList.add('show');
  $('hint').textContent = t('hint.live');
  drawRows();
  drawStats();
  applySearch();
  $('livenote').className = 'note';
  $('livenote').textContent = segs.length + ' ' + t('live.captured');
  $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- render ---------------- */
function speakerClass(s) {
  const c = String(s).toUpperCase().charCodeAt(0);
  return 'spk-' + (c >= 65 && c <= 70 ? String(s).toUpperCase() : 'A');
}
const nameOf = spk => names[spk] || t('speaker.prefix') + ' ' + spk;

function render(result) {
  const utterances = result.utterances || [];
  if (!utterances.length) { say(t('upload.nospeech'), true); return; }

  segments = splitIntoSegments(utterances);
  names = {};
  baseName = picked.name.replace(/\.[^.]+$/, '');

  audio.src = URL.createObjectURL(picked);
  $('player').classList.add('show');
  $('toolbar').classList.add('show');
  $('hint').textContent = t('hint.ready');
  statusEl.className = '';
  $('setup').classList.add('collapsed');
  syncSettingsToggle();

  drawRows();
  drawStats();
  list.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawRows() {
  list.textContent = '';
  rows = [];
  for (const seg of segments) {
    const row = document.createElement('div');
    row.className = 'row';

    const btn = document.createElement('button');
    btn.className = 'btn ' + speakerClass(seg.speaker);
    // live sessions have no audio to seek, so the play affordance is dropped there
    const playable = !!audio.getAttribute('src');
    if (playable) btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const nm = document.createElement('span');
    nm.textContent = nameOf(seg.speaker);
    btn.append(nm);
    if (playable) {
      btn.title = 'Play ' + fmtTime(seg.start) + ' — ' + nameOf(seg.speaker);
      btn.onclick = () => play(seg.start / 1000, seg.end / 1000, row);
    } else {
      btn.style.cursor = 'default';
      btn.title = nameOf(seg.speaker);
    }

    const rename = document.createElement('button');
    rename.className = 'rename';
    rename.textContent = '✎';
    rename.title = 'Rename ' + nameOf(seg.speaker);
    rename.onclick = e => { e.stopPropagation(); renameSpeaker(seg.speaker); };

    const body = document.createElement('div');
    body.className = 'body';
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = seg.text;
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = fmtTime(seg.start);
    body.append(text, time);

    const left = document.createElement('div');
    left.className = 'left';
    left.append(btn, rename);
    row.append(left, body);
    list.append(row);
    rows.push({ el: row, seg, textEl: text });
  }
}

function renameSpeaker(spk) {
  const next = prompt(t('speaker.renamePrompt') + ' ' + nameOf(spk) + ':', names[spk] || '');
  if (next === null) return;
  const v = next.trim();
  if (v) names[spk] = v; else delete names[spk];
  drawRows();
  drawStats();
  applySearch();
}

/* Speaker names with the localized fallback applied, for anything outside app.js —
   transcript.js and llm.js would otherwise fall back to the English "Speaker A". */
function resolvedNames() {
  const out = {};
  for (const s of segments) out[s.speaker] = nameOf(s.speaker);
  return out;
}

function drawStats() {
  const stats = talkTime(segments, resolvedNames());
  const el = $('stats');
  el.textContent = '';
  for (const s of stats) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const dot = document.createElement('i');
    dot.className = 'dot ' + speakerClass(s.speaker);
    chip.append(dot, document.createTextNode(`${s.name} · ${s.pct}% · ${fmtTime(s.ms)}`));
    el.append(chip);
  }
}

/* ---------------- search ---------------- */
const search = $('search');
search.oninput = applySearch;
$('clearsearch').onclick = () => { search.value = ''; applySearch(); };

function applySearch() {
  const q = search.value.trim().toLowerCase();
  let hits = 0;
  for (const { el, seg, textEl } of rows) {
    if (!q) {
      el.style.display = '';
      textEl.textContent = seg.text;
      continue;
    }
    const idx = seg.text.toLowerCase().indexOf(q);
    if (idx === -1) { el.style.display = 'none'; continue; }
    el.style.display = '';
    hits++;
    // rebuild with <mark> around every match, without using innerHTML on user text
    textEl.textContent = '';
    const lower = seg.text.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lower.indexOf(q, from);
      if (at === -1) { textEl.append(seg.text.slice(from)); break; }
      textEl.append(seg.text.slice(from, at));
      const m = document.createElement('mark');
      m.textContent = seg.text.slice(at, at + q.length);
      textEl.append(m);
      from = at + q.length;
    }
  }
  $('searchnote').textContent = q
    ? (hits ? hits + ' ' + t(hits === 1 ? 'toolbar.match' : 'toolbar.matches') : t('toolbar.nomatch'))
    : '';
}

/* ---------------- playback ---------------- */
function play(start, end, el) {
  if (playingEl) playingEl.classList.remove('playing');
  el.classList.add('playing');
  playingEl = el; stopAt = end;
  audio.currentTime = start;
  audio.play();
}
audio.addEventListener('timeupdate', () => {
  if (stopAt !== null && audio.currentTime >= stopAt) {
    audio.pause(); stopAt = null;
    if (playingEl) { playingEl.classList.remove('playing'); playingEl = null; }
  }
});
audio.addEventListener('pause', () => { stopAt = null; });

/* ---------------- exports ---------------- */
function download(text, filename, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

$('export').onchange = e => {
  const fmt = e.target.value;
  e.target.selectedIndex = 0;
  if (!fmt || !segments.length) return;
  const meta = { title: baseName, generated: new Date().toISOString() };
  if (fmt === 'txt')  download(buildTxt(segments, resolvedNames()), baseName + ' - transcript.txt');
  if (fmt === 'md')   download(buildMarkdown(segments, resolvedNames(), baseName), baseName + ' - transcript.md', 'text/markdown');
  if (fmt === 'srt')  download(buildSrt(segments, resolvedNames()), baseName + '.srt', 'application/x-subrip');
  if (fmt === 'vtt')  download(buildVtt(segments, resolvedNames()), baseName + '.vtt', 'text/vtt');
  if (fmt === 'json') download(buildJson(segments, resolvedNames(), meta), baseName + '.json', 'application/json');
  if (fmt === 'summary') {
    const s = $('summary').dataset.md;
    if (s) download(s, baseName + ' - summary.md', 'text/markdown');
  }
};

/* ---------------- summary ---------------- */
let abortSummary = null;

$('summarize').onclick = async () => {
  if (!segments.length) return;
  const p = provSel.value;
  const apiKey = (localStorage.getItem('llm_key_' + p) || llmKey.value).trim();
  if (!apiKey) {
    $('setup').classList.remove('collapsed');
    setSummary('', t('summary.needkey') + ' ' + PROVIDERS[p].label + ' ' + t('summary.needkey2'), true);
    return;
  }
  const transcript = buildPrompt(segments, resolvedNames());
  const box = $('summarybox');
  box.classList.add('show');
  setSummary('', t('summary.working') + ' ' + PROVIDERS[p].label + ' · ' + modelSel.value
    + ' (~' + estimateTokens(transcript).toLocaleString() + ' ' + t('summary.tokens') + ')…');

  abortSummary = new AbortController();
  try {
    const md = await summarize({
      provider: p,
      apiKey,
      model: modelSel.value,
      baseUrl: baseInput.value.trim(),
      transcript,
      signal: abortSummary.signal,
    });
    setSummary(md, '');
  } catch (e) {
    if (e.name === 'AbortError') setSummary('', t('summary.cancelled'));
    else setSummary('', e.message || String(e), true);
  } finally {
    abortSummary = null;
  }
};

function setSummary(md, note, isErr) {
  const out = $('summary');
  out.dataset.md = md || '';
  out.textContent = '';
  if (md) out.append(renderMarkdown(md));
  const n = $('summarynote');
  n.textContent = note || '';
  n.className = 'note' + (isErr ? ' err' : '');
  $('copysummary').style.display = md ? 'inline-flex' : 'none';
}

$('copysummary').onclick = async () => {
  const md = $('summary').dataset.md;
  if (!md) return;
  await navigator.clipboard.writeText(md);
  $('summarynote').textContent = t('summary.copied');
};

/* Small Markdown renderer — headings, bullets, checkboxes, bold, inline code.
   Built with DOM nodes rather than innerHTML so model output can't inject markup. */
function renderMarkdown(md) {
  const frag = document.createDocumentFragment();
  let ul = null;
  const inline = (parent, s) => {
    // **bold** and `code`
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parent.append(s.slice(last, m.index));
      if (m[2] !== undefined) { const b = document.createElement('strong'); b.textContent = m[2]; parent.append(b); }
      else { const c = document.createElement('code'); c.textContent = m[3]; parent.append(c); }
      last = m.index + m[0].length;
    }
    if (last < s.length) parent.append(s.slice(last));
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!ul) { ul = document.createElement('ul'); frag.append(ul); }
      const li = document.createElement('li');
      let body = bullet[1];
      const task = body.match(/^\[([ xX])\]\s*(.*)$/);
      if (task) {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.disabled = true; cb.checked = task[1].toLowerCase() === 'x';
        li.append(cb, ' ');
        body = task[2];
      }
      inline(li, body);
      ul.append(li);
      continue;
    }
    ul = null;
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const el = document.createElement('h' + Math.min(6, h[1].length + 2));
      el.textContent = h[2];
      frag.append(el);
    } else {
      const p = document.createElement('p');
      inline(p, line);
      frag.append(p);
    }
  }
  return frag;
}
