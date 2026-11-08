# Tamil History Video Automation

Project definition for a Tamil-language, faceless history channel producing four Shorts and one approximately 10-minute video per week.

## First milestone

Turn one approved research brief into one finished Tamil Short with narration, scene visuals, captions, and a local MP4 preview. Then extend the same workflow to a long video and four related Shorts.

The first local workflow is implemented: validate a sourced research brief, export an editable Tamil script and review page, record version-specific script approval, synthesize Tamil narration through ElevenLabs, and render the inscriptions pilot as a captioned vertical MP4. Azure Speech remains an optional fallback. The pilot script is authored in the repository; automatic research, AI script writing, and YouTube integration are not implemented yet.

## Run locally

For the visual editor, run `npm run studio` and open `http://127.0.0.1:4317`. The [dashboard guide](docs/dashboard.md) covers editing, source review, narration, job logs, previews, and exports.

The dashboard also offers optional OpenAI research and drafting from a topic title. It uses an environment-only `OPENAI_API_KEY`, web-search citations, and structured episode output. Generated proposals can be reviewed and applied without removing manual editing. Live API availability depends on a valid key and account access; the integration is covered by mocked API and browser tests.

For new videos, use the [reusable episode workflow](docs/episodes.md). It supports six scene templates, any scene count, vertical Shorts, and landscape long-form videos. Research and Tamil scripts are supplied in episode JSON files; normal operation needs no chat session. Start with `npm run episode -- new <episode-id> --format short` or use `--format long` for a ten-minute target.

Requires Node.js 22 or later. Narration uses built-in modules. The pilot video renderer uses FFmpeg (installed locally by ffmpeg-static), Playwright, and an existing Chrome or Edge browser. On this Windows setup, Tamil text uses the installed Nirmala UI font. Set `CHROME_PATH` if the browser is installed elsewhere.

```powershell
npm run doctor
npm test
npm run pilot
```

If PowerShell blocks npm.ps1, use npm.cmd instead, or run `node src/cli.js prepare content/pilot.json` directly.

The pilot command prints the location of `review.html`. Open it in a browser to read the scenes and claim ledger. Edit `content/pilot.json` to change the script, then run the pilot command again. The output directory contains `script.md`, `narration.txt`, source references in `brief.json`, a scene plan, and SSML files. Outputs are grouped by a content fingerprint, so edits get a separate directory and require fresh approval.

The target is 45 seconds; duration has not been measured until audio is generated. The example is a draft for historical and Tamil-language review, not approved publication content.

## Tamil narration

ElevenLabs is the default provider, using your existing API subscription. No npx command, SDK, or package installation is required. The adapter uses the [text-to-speech REST API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), with `eleven_v3` as the initial Tamil model. Tamil is listed in [ElevenLabs' v3 language support](https://elevenlabs.io/v3). Voice quality and historical-name pronunciation still need listening review.

The API key is read directly from the `Elevenlabs_Api_Key` environment variable. The standard `ELEVENLABS_API_KEY` spelling is also supported. Credentials are never loaded from or written to local files. The variable must be available to the process running the CLI. The doctor command reports only whether a key is present, never its value.

Select a Tamil-suitable voice in your ElevenLabs voice library and copy its voice ID. Use a voice available to your account. Set the non-secret `ELEVENLABS_VOICE_ID` environment variable or pass `--voice <voice_id>` to narration commands. Do not paste the API key into chat.

First create and listen to a short pronunciation sample:

List the Tamil voices available to your account with `node src/cli.js voices ta`. This sends a read-only API request using the environment key; it does not generate speech. The listing currently covers the first 100 voices and reports whether more pages exist.

```powershell
node src/cli.js narrate content/pilot.json --sample --allow-paid
```

After reviewing the script and sources, record approval and generate full narration:

```powershell
node src/cli.js approve content/pilot.json --reviewer "Your name"
node src/cli.js narrate content/pilot.json --allow-paid
```

Use `--voice <voice_id>` to compare a second voice, or `--model eleven_flash_v2_5` to compare the alternate model. Each provider/model/voice/content version has separate cached WAVs. Reruns reuse completed segments; failures stop without automatic retries. Concurrent runs for the same configuration are blocked by a lock file. If a process is forcibly terminated, inspect its outputs and confirm it is stopped before manually removing its `.narration.lock`.

Rajan is selected provisionally for the inscriptions pilot in `config/channel.json`, under `narration.pilot_voices`. The permanent channel voice remains undecided. `--voice` overrides the pilot choice; other briefs use `ELEVENLABS_VOICE_ID` when no pilot choice exists. Full narration also produces a combined `narration.wav` for listening review, assembled locally from the cached scene clips.

The adapter requests 24kHz mono PCM and wraps it in a WAV header locally. No FFmpeg installation is needed for narration or duration measurement. Calls use subscription credits; confirm your available credits and API access in ElevenLabs before starting a full batch.

Azure fallback: set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, and pass `--provider azure`. Voices are `ta-IN-ValluvarNeural` (default) and `ta-IN-PallaviNeural`. Azure uses separate credentials and billing.

Narration requires the explicit `--allow-paid` flag per invocation. No requests run during prepare, approval, doctor, or tests. The usage ledger records requests and character counts, including failed or uncertain attempts; actual billed cost remains unknown until reconciled with the provider. This version does not enforce a monetary budget cap.

## Render the pilot video

Install dependencies once with `npm ci`. With the matching Rajan narration already cached, run:

```powershell
npm run pilot:video
```

This command creates approximate Tamil captions anchored to each scene's measured audio duration, renders the original explanatory diagrams and captions in Chrome, and exports a 1080x1920, 30 fps H.264/AAC MP4. It uses no paid API calls and does not regenerate narration. Outputs are collected in `output/pilot-inscriptions-rajan/`: video, poster, SRT captions, sources, and a verification manifest. The renderer checks text overflow, media formats, and full video decoding. Original diagrams are illustrative, not photographs or historical facsimiles. The original pilot artwork is preserved; new episodes use the reusable scene layouts described in the episode guide.

The user chose approximate caption timing for the pilot because the current ElevenLabs key lacks Forced Alignment permission. Approximate timings require a listening review before publication. If Forced Alignment access is enabled later, `node src/align-cli.js <brief.json> <audio-directory> --allow-paid` can create word-aligned captions. To preserve those captions, run `node src/render-cli.js <brief.json> <audio-directory>` directly; the pilot convenience command intentionally rebuilds approximate captions.

The video is a local preview. Rendering does not approve or publish it.

## Channel defaults

- Subject: Tamil history, with individual series and time periods chosen during planning.
- Audience assumption: general Tamil-speaking viewers; no prior history knowledge required.
- Voice direction: deep, measured Tamil documentary delivery with restrained emotion and reviewed pronunciation of historical names.
- Weekly output: four 30–60-second vertical Shorts and one roughly 10-minute landscape video.
- Budget: INR 2,000–5,000 per month. No paid API calls are authorized by configuration alone.
- Review: approve historical claims and scripts before media generation; review the rendered video before publication.

## Production workflow

Topic -> research and claim ledger -> long script + four standalone Short scripts -> script review -> narration -> timed scene plan -> visuals -> rendering -> video review -> export -> optional publishing.

Reuse source research and suitable visual assets across formats. Give each Short its own hook, context, and payoff; do not assume it is just a crop of the long video.

See [the implementation plan](docs/implementation-plan.md), [editorial rules](docs/editorial-policy.md), and [channel configuration](config/channel.json).
