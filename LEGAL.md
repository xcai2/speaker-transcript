# Legal & privacy

*This is practical guidance, not legal advice. If a recording matters legally, talk to a lawyer.*

## What this tool does with your data

**Nothing is sent to any server operated by this project — there is no server.** The web page
is static files on GitHub Pages.

| What | Where it goes |
|---|---|
| Uploaded audio | Browser → the transcription provider you configured (AssemblyAI). Nowhere else. |
| **Live-caption audio** | **Browser → your browser vendor's speech service.** See the warning below. |
| Your transcript | Stays in the browser tab. Exports save to your machine. |
| Your API keys | Your browser's storage, on this site's origin only. Sent only to that provider's API. Choose "remember" (persists) or session-only (cleared when the tab closes), and wipe them any time with **Forget all keys**. |
| Summary text | Browser → the LLM provider you chose, only when you click **AI Summary**. |

> **Live captions are not private.** The Web Speech API is implemented by the browser, and in
> Chrome that means your microphone audio is streamed to Google's speech service for
> recognition. This project has no control over that and receives none of it. **For anything
> confidential, use Upload mode**, where audio goes only to the provider you chose.

Nothing is stored after you close the tab, apart from your keys and settings in
`localStorage`. Clear them by clearing site data.

Your audio *is* processed by the providers you pick. Read their terms:
[AssemblyAI](https://www.assemblyai.com/legal/privacy-policy) ·
[OpenAI](https://openai.com/policies/privacy-policy) ·
[Anthropic](https://www.anthropic.com/legal/privacy) ·
[DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)

The Python script (`transcribe.py`) is the same, minus the browser: your file goes from your
machine to AssemblyAI and the output is written next to the source file.

## Recording law — read before you record anyone

Recording law varies by jurisdiction and the penalties are real. The tool cannot know where
you are or who is on the call. **That responsibility is yours.**

### United States

Federal law and most states allow recording with **one party's** consent — yours, if you're
in the conversation.

These states generally require **all parties** to consent:

| State | Notes |
|---|---|
| California | Penal Code § 632 — criminal penalties |
| Illinois | 720 ILCS 5/14-2 — criminal penalties |
| Washington | RCW 9.73.030 |
| Pennsylvania | 18 Pa.C.S. § 5703 — felony for some calls |
| Florida | Fla. Stat. § 934.03 |
| Massachusetts | Mass. Gen. Laws ch. 272 § 99 — strict; secret recording is barred |
| Maryland | Md. Code Cts. & Jud. Proc. § 10-402 |
| Michigan, Montana, Nevada, New Hampshire, Connecticut, Oregon, Delaware | Rules vary; check before relying |

For interstate calls, assume **the strictest** applicable law.

### Elsewhere

- **EU / UK (GDPR):** a recording containing identifiable voices is personal data. You need a
  lawful basis, must tell people, and must honour access/erasure requests.
- **China (PIPL):** separate, informed consent is generally required before collecting voice data.
- **Canada (PIPEDA):** one-party consent federally; provincial rules add duties.
- **Australia:** varies by state; several require all-party consent.

### Situations that need extra care

- **Job interviews** — usually barred by company policy even where legally permitted.
- **Medical, legal, financial conversations** — additional confidentiality duties (HIPAA and similar).
- **Classes and lectures** — often governed by institutional policy; ask first.
- **Anyone under 18** — stricter rules almost everywhere.

## Practical guidance

1. **Ask.** "Do you mind if I record this so I can take notes?" solves nearly every problem.
2. **Record the consent** at the start of the recording.
3. **Assume all-party consent** if you don't know where the other person is.
4. **Don't record covertly.** Beyond legality, it's a trust problem.
5. **Delete when done.** The safest data is data you no longer hold.

## No warranty

This software is provided under the [MIT License](LICENSE) **without warranty of any kind**.
The authors accept no liability for how it is used, including any unlawful recording or
processing of audio. You are solely responsible for complying with the laws that apply to you.
