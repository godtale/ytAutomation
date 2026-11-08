# Local production dashboard

Start the studio from the project folder:

```powershell
npm run studio
# If PowerShell blocks npm.ps1: npm.cmd run studio
```

Open http://127.0.0.1:4317 in your browser. Keep the terminal running while jobs are active. Stop the server with Ctrl+C after jobs finish. The server listens only on the loopback address; it is not a hosted service.

The existing Rajendra Chola Short and original pilot are available immediately. Create a new episode with its own ID, Tamil title, and vertical or landscape format. Drafts can be saved before research and narration are complete. Use the scene editor to add, remove, or reorder scenes, select a visual template, and edit Tamil narration and on-screen labels. Add sources and claims on the research tab and reference their IDs from scenes. Episode JSON is available for advanced fields such as pronunciation glossaries.

Choose a voice by ID or use **Load Tamil voices** to read your ElevenLabs library. The API key is read only from the environment (`Elevenlabs_Api_Key`); there is no credential input or file-based key loading. Loading voices makes a read-only API request and does not synthesize speech.

Production sequence:

1. Save the draft. Incomplete research or narration is reported in the production panel.
2. Prepare the script version.
3. Review the script and sources, then approve it.
4. Enable the subscription-credit checkbox and generate a sample or full narration. A sample can precede approval; full narration cannot.
5. Render video from cached narration. Captions use approximate scene timing, matching the current pilot preference.
6. Review the local video, play the audio, or download MP4, SRT, and source notes.

Jobs run one at a time. Their logs and brief snapshots are under `output/dashboard-jobs/`. Do not close the server during production. Job history is visible for the current server session; jobs are not automatically resumed after a restart. Media and scripts remain on disk. Content edits create a new version and require fresh preparation and approval. The dashboard refuses conflicting saves and saves during queued/running jobs. Existing cached media is shown only when it matches the current saved episode version and voice.

## Optional OpenAI research and drafting

Set `OPENAI_API_KEY` (or `OpenAI_Api_Key`) in the environment that launches the studio. Keys are never entered in the UI, loaded from files, or returned to the browser. The default model is `gpt-4.1-mini`; set `OPENAI_MODEL` in the environment to use another Responses API model that supports web search and structured outputs. Restart `npm run studio` after changing its environment.

Create an episode with just a topic/title and select **AI research & draft**. The ID is generated automatically if left blank. Alternatively, open **Research & draft with OpenAI** on an existing saved episode. Choose the format and target duration, enter an optional focus, enable OpenAI API usage, and select **Research & generate draft**.

The job makes two API requests: web research with citations, followed by a structured Tamil episode draft. It generates the title, script, scene layouts, visual labels, source records, claim links, glossary, and pronunciation sample. Source URLs must appear in the research citations; the draft is rejected if it invents an additional URL. This is a provenance check, not a guarantee that every historical claim is correct.

When complete, select **Review script & sources**. Read the sources, review notes, claims, and Tamil narration, then **Apply this draft to the episode**. Applying replaces the script, sources, and scenes but preserves an already selected voice. Existing content remains unchanged until apply. If the episode changes after research begins, stale proposals cannot overwrite it. The generated draft still requires preparation and script approval before full narration. Manual editing remains available before and after generation.

OpenAI API usage and web search are billed separately from narration. The checkbox enables a single generation job; it does not authorize automatic narration or publication. Requests are bounded by output-token and tool-call limits, are not automatically retried, and record usage under `output/dashboard-jobs/<job-id>/openai-usage.jsonl`. Actual billed costs must be reconciled with the provider; there is no monetary cap in this version. Research/draft results are saved separately in `generated-draft.json`. Current-session proposal review is available until the server restarts; the stored JSON remains on disk afterward.

If OpenAI returns HTTP 401, update the environment key with a valid API credential and restart the server. A key-available indicator means a variable exists; it does not verify API access or billing.

Implementation references: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Scheduling and publishing remain future work. Editing and local rendering use no chat tokens; optional OpenAI generation consumes API usage, and new narration consumes ElevenLabs credits.

## Duplicate-request and cost protection

Paid AI generation is currently paused in `config/ai-controls.json`. The AI panel shows the current state and provides **Enable paid AI requests** / **Pause AI requests**. Enabling does not start a request; starting a new run still requires the per-run checkbox. Pausing cancels queued AI work and aborts active local requests. A provider may still bill work already sent before cancellation.

The server identifies a request by episode, topic, direction, format, duration, and model. Repeating it returns the existing job instead of calling OpenAI again, even after a server restart. Job status GET polling never starts generation. Interrupted jobs are restored as interrupted and are never automatically resumed. Changing a voice or reloading the page does not create a fresh research run.

Research and draft responses are checkpointed before validation and copied into `output/ai-cache/<request-key>/`. Completed stages can be reprocessed from their saved responses. If a stage was started but no response was saved, repeating that potentially billed stage is blocked. Do not delete a cache or change the topic simply to retry: inspect the run and explicitly decide whether another paid request is appropriate. A normal new job has at most one research HTTP request and one draft HTTP request; the research request may include web-search tool usage. No automatic retry occurs.

For a failed, interrupted, or cancelled run, **Retry failed AI run once · may incur API cost** provides that explicit choice. It requires both paid generation enabled and the per-run billing checkbox. It reuses completed cached stages and permits one new attempt for missing stages. Normal Generate clicks continue to reuse the old job; there is no automatic retry loop.

`could not connect (EACCES)` means the running studio process cannot access the network. Start the studio from a network-enabled local terminal or approve network access when launching it through a sandboxed agent. Restarting the server does not retry a failed topic; choose the explicit retry action only when ready. The `Missing sources` indicator on an empty draft describes the episode state and is not the transport error.
