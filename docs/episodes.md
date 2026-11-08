# Reusable episode workflow

Run these commands from the project directory. Use `npm.cmd` instead of `npm` if PowerShell blocks npm.ps1. The commands do not need a chat session. Node 22+, `npm ci`, Chrome/Edge, and the Nirmala UI Tamil font are required on this Windows setup.

## Start a new episode

```powershell
npm run episode -- new chola-01 --format short
# Or: npm run episode -- new chola-long-01 --format long
```

This writes `episodes/chola-01.json`, without overwriting an existing episode. It deliberately creates an unfinished draft: fill the title, sources, claim ledger, pronunciation sample, and scene narration before running prepare. No historical claims or sources are invented automatically.

For a populated reference, see `examples/inscriptions.json`, which uses the pilot's existing sourced script with reusable layouts. It selects Rajan for that example only. Copy it under a new episode ID before making your own video. An empty draft is available in `episodes/workflow-starter.json`; check rejects it until you fill its research and script fields.

Shorts use 1080x1920; long videos use 1920x1080. Long episodes default to a 600-second target. Actual length follows the generated audio, so edit the script to reach the desired duration. Ten-minute narration is generated in individual scenes, never as one large API request. Short targets may be 15–180 seconds; long targets 300–900 seconds. These are project validation ranges, not claims about platform eligibility.

## Edit the content

Every source needs `id`, `title`, HTTPS `url`, and a passage `locator`. Every claim needs `id`, `text`, and `source_ids`. Every scene needs `id`, `role`, Tamil `text`, `claim_ids`, a plain-English `visual` note, and a `layout`.

```json
{
  "template": "comparison",
  "title": "ஒப்பிட்டு அறிதல்",
  "subtitle": "",
  "items": ["முதல் பதிவு", "இரண்டாம் பதிவு"]
}
```

Layouts: `title`, `event`, `evidence`, `timeline`, `comparison`, `conclusion`. Use 1–4 short item labels, in chronological order for a timeline. These templates create explanatory graphics, not geographic maps or reconstructions. Keep titles concise; the renderer checks Tamil text fit. Add any number of scenes, including repeat uses of a template. The historical accuracy of layout text must be reviewed alongside narration.

Optional top-level fields: `series` (Tamil channel/series name), `source_credit` (short on-screen source credit), and `narration: { "voice_id": "..." }`. Rajan remains selected only for the existing pilot. Set a voice for each new episode or use the `ELEVENLABS_VOICE_ID` environment variable. Secrets are read only from the environment, including `Elevenlabs_Api_Key`.

## Review, narrate, render

```powershell
npm run episode -- check episodes/chola-01.json
npm run episode -- prepare episodes/chola-01.json
# Read the printed review.html, verify sources and script, then:
npm run episode -- approve episodes/chola-01.json --reviewer "Your name"
npm run episode -- narrate episodes/chola-01.json --sample --allow-paid
npm run episode -- narrate episodes/chola-01.json --allow-paid
npm run episode -- render episodes/chola-01.json --captions approximate
npm run episode -- status episodes/chola-01.json
```

Only narrate calls ElevenLabs and consumes subscription credits. Sample narration can run before script approval; full narration requires approval. Prepare/check/render are local. Render uses existing audio and does not write credentials, approve content, or publish videos. Caption timings default to approximate, anchored to scene durations. Listen and adjust before publication. If the key gains Forced Alignment access, create alignment with the lower-level alignment command and use `--captions aligned` to preserve it.

Each edited content version gets a separate output directory and approval. The exported package is under `output/episodes/<id>/<content-hash>/`, containing MP4, SRT, poster, sources, and render verification. Cached narration is grouped by content version, provider, model, and voice. Unchanged reruns reuse audio. Editing the brief currently invalidates the whole episode cache; scene-level reuse across script versions is a future optimization.

The existing pilot commands and cached pilot audio still work. The permanent channel voice remains undecided. Research discovery, automatic script writing, scheduling, and publishing remain future work; this workflow consumes human-reviewed episode files.
