/* LLM clients for summarization. Everything runs in the browser with the user's own key.
   Nearly every provider ships an OpenAI-compatible endpoint, so there is one client for all
   of them plus a special case for Anthropic's different request shape. */

import { fixSpaces } from './transcript.js';

export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    base: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    kind: 'openai',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    base: 'https://api.anthropic.com/v1',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    kind: 'anthropic',
  },
  deepseek: {
    label: 'DeepSeek 深度求索',
    base: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    kind: 'openai',
  },
  moonshot: {
    label: 'Kimi 月之暗面',
    base: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    kind: 'openai',
  },
  doubao: {
    label: 'Doubao 豆包 (Volcengine)',
    base: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-32k', 'doubao-pro-128k'],
    keyUrl: 'https://console.volcengine.com/ark',
    kind: 'openai',
    note: 'Use your Ark endpoint ID as the model name.',
  },
  qwen: {
    label: 'Qwen 通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    keyUrl: 'https://bailian.console.aliyun.com/',
    kind: 'openai',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    base: '',
    models: [],
    keyUrl: '',
    kind: 'openai',
    note: 'Any server exposing /chat/completions — Ollama, vLLM, LM Studio, OpenRouter…',
  },
};

/* Rough token estimate. Latin text ~4 chars/token; CJK closer to ~1.5. */
export function estimateTokens(text) {
  const cjk = (text.match(/[㐀-鿿぀-ヿ]/g) || []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

const SYSTEM = `You are an expert meeting analyst. You will be given a transcript where each
line is labelled with the speaker. Produce a concise, accurate summary.

Rules:
- Base everything strictly on the transcript. Never invent facts, numbers, or commitments.
- Attribute points to the speaker names exactly as they appear.
- If the transcript is in Chinese, answer in Chinese. Otherwise answer in English.
- If there are no action items, write "None identified" rather than inventing any.

Respond in Markdown with exactly these sections:

## Summary
Three sentences at most, covering what this conversation was actually about.

## Key points
- 4 to 8 bullets. Attribute where it matters, e.g. "Sarah proposed …".

## Action items
- [ ] Task — **owner** — mentioned around \`MM:SS\`
Only include real commitments. Use the timestamps given in the transcript.

## Open questions
- Anything left explicitly unresolved. Omit this section if there is nothing.`;

/* Build the prompt. Timestamps are included so the model can cite them in action items. */
export function buildPrompt(segments, names) {
  const nameOf = spk => (names && names[spk]) || 'Speaker ' + spk;
  const lines = [];
  let curSpk = null, cur = [], curStart = 0;
  const mmss = ms => String(Math.floor(ms / 60000)).padStart(2, '0') + ':'
                   + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const flush = () => { if (cur.length) lines.push(`[${mmss(curStart)}] ${nameOf(curSpk)}: ${fixSpaces(cur.join(' '))}`); };
  for (const s of segments) {
    if (s.speaker !== curSpk) { flush(); curSpk = s.speaker; cur = [s.text]; curStart = s.start; }
    else cur.push(s.text);
  }
  flush();
  return lines.join('\n');
}

/* Single entry point. Returns the summary as Markdown. */
export async function summarize({ provider, apiKey, model, baseUrl, transcript, signal }) {
  const cfg = PROVIDERS[provider] || PROVIDERS.custom;
  const base = (baseUrl || cfg.base || '').replace(/\/+$/, '');
  if (!base) throw new Error('No API base URL configured for this provider.');
  if (!apiKey) throw new Error('No API key set. Add one in Settings.');

  return cfg.kind === 'anthropic'
    ? callAnthropic({ base, apiKey, model, transcript, signal })
    : callOpenAICompatible({ base, apiKey, model, transcript, signal });
}

async function callOpenAICompatible({ base, apiKey, model, transcript, signal }) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: 'Transcript:\n\n' + transcript },
  ];
  const post = body => fetch(base + '/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });

  // A low temperature suits summarization, but reasoning models (GPT-5 and friends) reject
  // any value but their default. It's a nice-to-have, so drop it and retry rather than fail.
  let res = await post({ model, messages, temperature: 0.2 });
  if (!res.ok && res.status === 400) {
    const msg = await res.clone().text().catch(() => '');
    if (/temperature/i.test(msg)) res = await post({ model, messages });
  }

  if (!res.ok) throw new Error(await describeError(res));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    // reasoning models can spend the whole budget on reasoning and return no visible text
    const reason = data.choices?.[0]?.finish_reason;
    throw new Error(reason === 'length'
      ? 'The model hit its output limit before writing a summary. Try a shorter recording or another model.'
      : 'The model returned an empty response.');
  }
  return text;
}

async function callAnthropic({ base, apiKey, model, transcript, signal }) {
  const res = await fetch(base + '/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for calls made directly from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Transcript:\n\n' + transcript }],
    }),
  });
  if (!res.ok) throw new Error(await describeError(res));
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('The model returned an empty response.');
  return text;
}

async function describeError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.error?.message || body.message || JSON.stringify(body).slice(0, 200);
  } catch { detail = (await res.text().catch(() => '')).slice(0, 200); }

  if (res.status === 401 || res.status === 403) return 'API key rejected (' + res.status + '). ' + detail;
  if (res.status === 404) return 'Model or endpoint not found (404). Check the model name and base URL. ' + detail;
  if (res.status === 429) return 'Rate limited or out of quota (429). ' + detail;
  return 'Request failed (' + res.status + '). ' + detail;
}
