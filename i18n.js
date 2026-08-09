/* Interface language. Only the UI chrome is translated — transcript content is whatever
   language was spoken, and the speech-recognition language is a separate control. */

export const STRINGS = {
  en: {
    'brand.tag': "Hear who's speaking",
    'hint.default': 'Upload a recording to get a speaker-separated transcript',
    'hint.ready': 'Click a speaker button to play that segment',
    'hint.live': 'Live session captured — search, summarize or export it',

    'legal.title': 'Record responsibly',
    'legal.p1': 'Recording laws vary by jurisdiction. Some U.S. states — including California, Illinois, Washington, Pennsylvania and Florida — require <strong>everyone</strong> being recorded to consent. The EU (GDPR) and China (PIPL) impose additional duties.',
    'legal.p2': 'You are responsible for having the right to record and process any audio you use with this tool.',
    'legal.ok': 'I understand',

    'settings.title': 'Settings',
    'settings.hide': 'Hide',
    'settings.show': 'Settings',
    'settings.sub': "Everything runs in your browser using <strong>your own</strong> API keys. Keys are stored only in this browser's local storage and are sent directly to the provider you choose — they never reach any server of mine, and neither does your audio.",
    'settings.aaiLabel': 'Transcription — AssemblyAI API key',
    'settings.aaiPh': 'Paste your AssemblyAI key',
    'settings.aaiNote': 'Required. Get a free key at',
    'settings.aaiCost': '— around $0.15–0.27 per hour of audio.',
    'settings.llmLabel': 'AI summary — model provider',
    'settings.llmPh': 'Paste your model provider key',
    'settings.llmNote': 'Optional — only needed for summaries.',
    'settings.getKey': 'Get a key',
    'settings.baseUrl': 'Base URL',
    'settings.save': 'Save',
    'settings.saved': 'Saved in this browser.',
    'settings.cleared': 'Key cleared.',
    'settings.hasKey': 'A key is saved in this browser.',
    'settings.addModel': '+ Model',
    'settings.modelPrompt': 'Model name:',

    'tab.upload': '📁 Upload a recording',
    'tab.live': '🎙 Live captions',

    'upload.title': 'Upload a recording',
    'upload.sub': 'Audio or video — m4a, mp3, wav, mp4 and more. A one-hour file takes roughly 5–10 minutes, and gives you <strong>speaker separation</strong>.',
    'upload.drop': 'Drop a file here, or click to choose',
    'upload.none': 'No file selected',
    'upload.go': 'Transcribe',
    'upload.uploading': 'Uploading',
    'upload.queued': 'Queued for transcription…',
    'upload.working': 'Transcribing…',
    'upload.elapsed': 'elapsed. This usually takes 5–10 minutes for a one-hour recording.',
    'upload.nospeech': 'No speech was detected in that file.',

    'live.title': 'Live captions',
    'live.sub': "Transcribes from your microphone as you speak, using your browser's built-in speech engine — <strong>free, no API key</strong>. When you stop, the text becomes a normal transcript you can search, summarize and export.<br>No speaker separation in this mode — use Upload for that. Note that browsers implement this by sending audio to their own speech service (Google's, in Chrome), so for confidential material use Upload mode instead.",
    'live.lang': 'Speech language',
    'live.start': '● Start listening',
    'live.stop': 'Stop listening',
    'live.listening': 'Listening… speak normally.',
    'live.empty': 'Captions will appear here…',
    'live.nothing': 'Nothing was captured.',
    'live.captured': 'lines captured. They are now in the transcript below.',
    'live.unsupported': 'Your browser does not support the Web Speech API. Live captions work in Chrome, Edge and Safari; Firefox is not supported.',
    'live.insecure': 'Live captions need a secure origin. Open the hosted demo over https, or serve this page from http://localhost.',
    'live.reconnecting': 'Reconnecting to the speech service',
    'live.switchingLocal': 'Cloud recognition unavailable — switching to the on-device model…',
    'live.diagnosing': 'Checking what went wrong…',
    'live.offline': 'You appear to be offline. Reconnect and press Start again.',
    'live.blocked': "Your connection works, but the browser's speech service could not be reached — so something is blocking it specifically, not your network. The usual causes are an ad/privacy blocker extension, a firewall, or regional blocking of Google services.",
    'live.blockedFix': 'Try disabling extensions for this page (or open it in an Incognito window), or use Upload mode, which is unaffected.',
    'live.tryLocal': 'Your browser can run recognition on-device instead, which needs no connection at all:',
    'live.downloadLocal': '⬇ Download the on-device model',
    'live.useLocal': 'Use the on-device model',
    'live.downloading': 'Downloading the model…',
    'live.localReady': 'On-device model ready. Press Start listening — it now works without the cloud service.',
    'live.localFailed': 'The on-device model could not be installed. Use Upload mode, or try another browser or network.',
    'live.lost': 'Lost the connection to the speech service after several attempts. Check your network — the browser engine needs one — then press Start again. Some corporate or campus networks block it.',

    'toolbar.search': 'Search the transcript…',
    'toolbar.summary': '✨ AI Summary',
    'toolbar.export': 'Export…',
    'toolbar.exportSummary': 'Summary (.md)',
    'toolbar.matches': 'matching lines',
    'toolbar.match': 'matching line',
    'toolbar.nomatch': 'No matches',

    'summary.title': '✨ AI notes',
    'summary.copy': 'Copy',
    'summary.copied': 'Copied to clipboard.',
    'summary.working': 'Summarizing with',
    'summary.tokens': 'input tokens',
    'summary.needkey': 'Add an API key for',
    'summary.needkey2': 'in Settings first.',
    'summary.cancelled': 'Cancelled.',

    'speaker.prefix': 'Speaker',
    'speaker.me': 'Me',
    'speaker.renamePrompt': 'Name for',
  },

  zh: {
    'brand.tag': '听清每个人在说什么',
    'hint.default': '上传录音，获得按说话人分离的文字稿',
    'hint.ready': '点击说话人按钮播放对应片段',
    'hint.live': '实时记录已保存 — 可搜索、总结或导出',

    'legal.title': '合法录音提示',
    'legal.p1': '录音相关法律因司法辖区而异。美国部分州（包括加州、伊利诺伊州、华盛顿州、宾夕法尼亚州和佛罗里达州）要求<strong>所有</strong>被录音者均须同意。欧盟（GDPR）与中国（个人信息保护法）另有规定。',
    'legal.p2': '您需自行确保拥有录制及处理相关音频的合法权利。',
    'legal.ok': '我已了解',

    'settings.title': '设置',
    'settings.hide': '收起',
    'settings.show': '设置',
    'settings.sub': '所有处理均在您的浏览器中完成，使用<strong>您自己的</strong> API 密钥。密钥仅保存在本浏览器的本地存储中，并直接发送给您选择的服务商 — 不会经过我的任何服务器，您的音频同样如此。',
    'settings.aaiLabel': '转写 — AssemblyAI API 密钥',
    'settings.aaiPh': '粘贴您的 AssemblyAI 密钥',
    'settings.aaiNote': '必填。可在此免费获取：',
    'settings.aaiCost': '— 每小时音频约 $0.15–0.27。',
    'settings.llmLabel': 'AI 摘要 — 模型服务商',
    'settings.llmPh': '粘贴您的模型服务商密钥',
    'settings.llmNote': '可选 — 仅生成摘要时需要。',
    'settings.getKey': '获取密钥',
    'settings.baseUrl': '接口地址',
    'settings.save': '保存',
    'settings.saved': '已保存在本浏览器中。',
    'settings.cleared': '密钥已清除。',
    'settings.hasKey': '本浏览器中已保存密钥。',
    'settings.addModel': '+ 模型',
    'settings.modelPrompt': '模型名称：',

    'tab.upload': '📁 上传录音',
    'tab.live': '🎙 实时字幕',

    'upload.title': '上传录音',
    'upload.sub': '音频或视频 — 支持 m4a、mp3、wav、mp4 等格式。一小时的文件约需 5–10 分钟，并可获得<strong>说话人分离</strong>。',
    'upload.drop': '拖放文件到此处，或点击选择',
    'upload.none': '尚未选择文件',
    'upload.go': '开始转写',
    'upload.uploading': '正在上传',
    'upload.queued': '已加入转写队列…',
    'upload.working': '正在转写…',
    'upload.elapsed': '已用时。一小时的录音通常需要 5–10 分钟。',
    'upload.nospeech': '未在该文件中检测到语音。',

    'live.title': '实时字幕',
    'live.sub': '使用浏览器内置的语音引擎，边说边转写 — <strong>免费，无需 API 密钥</strong>。停止后，文字会变成普通文字稿，可搜索、总结和导出。<br>此模式不支持说话人分离 — 如需该功能请使用「上传」。请注意，浏览器通过将音频发送至其自有语音服务（Chrome 为 Google）来实现此功能，因此涉及机密内容时请改用上传模式。',
    'live.lang': '识别语言',
    'live.start': '● 开始聆听',
    'live.stop': '停止聆听',
    'live.listening': '正在聆听… 请正常说话。',
    'live.empty': '字幕将显示在这里…',
    'live.nothing': '未捕获到任何内容。',
    'live.captured': '条记录已捕获，已生成下方的文字稿。',
    'live.unsupported': '您的浏览器不支持 Web Speech API。实时字幕支持 Chrome、Edge 和 Safari，不支持 Firefox。',
    'live.insecure': '实时字幕需要安全来源。请通过 https 打开在线版本，或用 http://localhost 提供此页面。',
    'live.reconnecting': '正在重新连接语音服务',
    'live.switchingLocal': '云端识别不可用 — 正在切换到本地模型…',
    'live.diagnosing': '正在检查问题原因…',
    'live.offline': '您似乎处于离线状态。请重新连接后再点击「开始聆听」。',
    'live.blocked': '您的网络正常，但浏览器的语音服务无法访问 — 说明是该服务被单独拦截了，而非网络问题。常见原因是广告/隐私拦截插件、防火墙，或对 Google 服务的地区性封锁。',
    'live.blockedFix': '可尝试对本页面停用浏览器插件（或使用无痕窗口打开），也可以改用「上传」模式，该模式不受影响。',
    'live.tryLocal': '您的浏览器可以改用本地模型进行识别，完全无需联网：',
    'live.downloadLocal': '⬇ 下载本地语音模型',
    'live.useLocal': '使用本地模型',
    'live.downloading': '正在下载模型…',
    'live.localReady': '本地模型已就绪。请点击「开始聆听」— 现在无需云端服务即可使用。',
    'live.localFailed': '本地模型安装失败。请改用「上传」模式，或更换浏览器或网络。',
    'live.lost': '多次尝试后仍无法连接语音服务。请检查网络（浏览器语音引擎需要联网），然后重新点击「开始聆听」。部分企业或校园网络会屏蔽该服务。',

    'toolbar.search': '搜索文字稿…',
    'toolbar.summary': '✨ AI 摘要',
    'toolbar.export': '导出…',
    'toolbar.exportSummary': '摘要 (.md)',
    'toolbar.matches': '条匹配',
    'toolbar.match': '条匹配',
    'toolbar.nomatch': '无匹配结果',

    'summary.title': '✨ AI 摘要',
    'summary.copy': '复制',
    'summary.copied': '已复制到剪贴板。',
    'summary.working': '正在使用',
    'summary.tokens': '输入 tokens',
    'summary.needkey': '请先在设置中填写',
    'summary.needkey2': '的 API 密钥。',
    'summary.cancelled': '已取消。',

    'speaker.prefix': '说话人',
    'speaker.me': '我',
    'speaker.renamePrompt': '重命名',
  },
};

let current = 'en';

export function detectLang() {
  const saved = localStorage.getItem('ui_lang');
  if (saved && STRINGS[saved]) return saved;
  return /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en';
}

export function setLang(lang) {
  current = STRINGS[lang] ? lang : 'en';
  localStorage.setItem('ui_lang', current);
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  apply();
  return current;
}

export function getLang() { return current; }
export function t(key) { return STRINGS[current][key] ?? STRINGS.en[key] ?? key; }

/* Swap every tagged node. Strings containing markup use innerHTML — they are our own
   constants, never user or model input. */
export function apply(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const s = t(el.dataset.i18n);
    if (/<[a-z]/i.test(s)) el.innerHTML = s; else el.textContent = s;
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  const box = document.getElementById('livebox');
  if (box) box.dataset.empty = t('live.empty');
}
