# Reusable open-source code for the Cut Once server-side copilot and camera verification (Node 22 + TypeScript + Fastify)

Scope: `POST /v1/assemblies/:aid/copilot/query`, `GET /v1/audio/:turn_id` and `POST /v1/assemblies/:aid/verify` in `services/api`. Researched 2026-09-19 by reading source files through the GitHub API and the vendors' current docs. Nothing in the Cut Once repo was modified.

Local facts that shape every recommendation (read from the repo):
- `services/api/package.json` pins `"openai": "^4.77.0"`; the installed version is **4.104.0**. npm `latest` is **7.19.0** (modified 2026-09-18). `@elevenlabs/elevenlabs-js` and `sharp` are **not installed**. `@fastify/multipart` is `^9.0.1`, fastify `^5.2.0`, zod installed **3.25.76**.
- `src/llm.ts` `jsonCall()` already calls `client.chat.completions.create` with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` and base64 `image_url` parts. `toOpenAiSchema()` strips `minItems`, `pattern`, etc., and forces every property into `required` with `additionalProperties: false`.
- `retrieve()` never throws: it falls back from hybrid to BM25 to `[]`. `callKnowledgeTool()` never throws either.

---

## Q1. OpenAI Node SDK: transcription with `gpt-transcribe`, a two-image vision call with strict JSON (Responses vs Chat Completions), and streaming

### Takeaway
Use openai-node **v7** (Apache-2.0). Transcribe with `openai.audio.transcriptions.create({ file: await toFile(wavBuf, "q.wav"), model: "gpt-transcribe", keywords: [...] })`. Make the copilot call on the **Responses API**, which OpenAI recommends for new projects: two `input_image` parts plus `text: { format: { type: "json_schema", name, strict: true, schema } }`, and `reasoning: { effort: "none" | "low" }`, because `gpt-5.6-luna` defaults to `medium`. Stream with `client.responses.stream(...)`, which gives an accumulated `snapshot` on each `response.output_text.delta`. `client.chat.completions.stream(...)` goes further and hands you a partially parsed object (`parsed`) on each `content.delta`.

### Cited Findings

**Versions, licence, last commit**
- openai-node is Apache-2.0. Last commit is `91c7fb53` on 2026-09-19 ("add safety warning and deactivation webhook events"). npm `openai@7.19.0` was published 2026-09-18 — [openai/openai-node](https://github.com/openai/openai-node), [npm openai](https://www.npmjs.com/package/openai)
- The only breaking change in 7.0.0 (2026-07-27) is "require Node.js 22". The breaking change in 6.0.0 (2025-09-30) only affects function-call output types — [CHANGELOG.md](https://github.com/openai/openai-node/blob/main/CHANGELOG.md)
- v7 `package.json`: `"engines": { "node": ">=22.0.0" }` and peer dependency `"zod": "^3.25 || ^4.0"`. The repo's installed zod 3.25.76 satisfies this — [package.json](https://github.com/openai/openai-node/blob/main/package.json)
- From MIGRATION.md (the v4 to v5+ changes): `fileFromPath` is removed in favour of `fs.createReadStream`. The `beta.chat` namespace is gone, so `client.beta.chat.completions.parse/stream/runTools` become `client.chat.completions.parse/stream/runTools`. Zod helpers now **throw** on `.optional()` without `.nullable()` — [MIGRATION.md](https://github.com/openai/openai-node/blob/main/MIGRATION.md)
- In the installed **4.104.0**, the Responses API resource and `zodTextFormat` exist, `toFile` is exported from `uploads`, and the parsing stream helper is only at `client.beta.chat.completions.stream`. Grepping the 4.104.0 type files found no `gpt-transcribe`, `gpt-5.6`, or `'none'` reasoning effort (local check of `services/api/node_modules/openai/*.d.ts`).

**(a) Transcription from a WAV buffer**
- The model enum includes `'gpt-transcribe' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe' | ...` — [src/resources/audio/audio.ts](https://github.com/openai/openai-node/blob/main/src/resources/audio/audio.ts)
- `TranscriptionCreateParamsBase` has `file: Uploadable` and `model`. It also has `keywords?: Array<string>` ("Words or phrases to guide transcription … Supported by `gpt-transcribe`"), `languages?: Array<string>` ("Supported by `gpt-transcribe`"), `prompt?`, `response_format?`, and `stream?: boolean` ("Streaming is not supported for the `whisper-1` model"). The file must carry "enough format metadata … We recommend an extension-bearing filename" — [src/resources/audio/transcriptions.ts](https://github.com/openai/openai-node/blob/main/src/resources/audio/transcriptions.ts)
- The official guide calls `gpt-transcribe` the recommended model for recorded speech. The limit is 25 MB, and formats include wav. With `stream=true` it emits `transcript.text.delta` and `transcript.text.done`. Keywords must each be on one line and exclude `<`, `>`, CR and LF. The guide gives no latency figures — [Speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- Official example of `toFile` on a Buffer (outdated model `whisper-1`, current call shape) — [examples/audio/audio.ts](https://github.com/openai/openai-node/blob/main/examples/audio/audio.ts):
  ```ts
  import OpenAI, { toFile } from 'openai';
  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(buffer, 'speech.mp3'),
    model: 'whisper-1',
  });
  ```
- `examples/audio/speech-to-text.ts` also uses `whisper-1` and a `recordAudio` helper, so it is outdated for the model but not for the method — [examples/audio/speech-to-text.ts](https://github.com/openai/openai-node/blob/main/examples/audio/speech-to-text.ts)
- `toFile(value, name?, options?)` is exported in v7 at `src/internal/to-file.ts` (line 122) and in the installed v4.104 at `uploads.d.ts` — [src/internal/to-file.ts](https://github.com/openai/openai-node/blob/main/src/internal/to-file.ts)

**(b) Two images plus strict JSON: which API**
- OpenAI: "While Chat Completions remains supported, Responses is recommended for all new projects." It reports 40–80% better cache use than Chat Completions in internal tests — [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- The structured-output parameter shape differs between the two APIs — [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses):
  - Chat Completions: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`
  - Responses: `text: { format: { type: "json_schema", name, strict: true, schema } }`
- `gpt-5.6-luna` supports image input, structured outputs and streaming on both Responses and Chat Completions. Reasoning effort values are "none, low, medium (default), high, xhigh, and max". Context window is 1,050,000 tokens. Pricing is $0.20 per 1M input tokens, $0.02 cached, $1.20 output. The page states no latency figures — [gpt-5.6-luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- The SDK type `ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null`. `minimal` is **not** in luna's supported list — [src/resources/shared.ts](https://github.com/openai/openai-node/blob/main/src/resources/shared.ts)
- The Responses image part is `ResponseInputImage { type: 'input_image'; detail: ImageDetail; image_url?: string | null; file_id?: string | null }`, where `ImageDetail = 'low' | 'high' | 'auto' | 'original'`. `detail` is non-optional in the v7 type — [src/resources/responses/responses.ts](https://github.com/openai/openai-node/blob/main/src/resources/responses/responses.ts)
- `ResponseFormatTextJSONSchemaConfig` has `name: string; schema: {...}; type: 'json_schema'; strict?: boolean | null` — [src/resources/responses/responses.ts](https://github.com/openai/openai-node/blob/main/src/resources/responses/responses.ts)
- Official Responses plus Zod example (outdated model `gpt-4o-2024-08-06`, current API). Its comment says `zod/v4` "Also works for 'zod/v3'" — [examples/responses/structured-outputs.ts](https://github.com/openai/openai-node/blob/main/examples/responses/structured-outputs.ts):
  ```ts
  import { zodTextFormat } from 'openai/helpers/zod';
  const rsp = await client.responses.parse({
    input: 'solve 8x + 31 = 2',
    model: 'gpt-4o-2024-08-06',
    text: { format: zodTextFormat(MathResponse, 'math_response') },
  });
  console.log(rsp.output_parsed);
  ```
- Closest official **multi-image plus strict-schema** code is the OpenAI Cookbook vision grader (MIT; file last changed `f0f4a14b`, 2026-02-03). It is Python, but the request body maps one-to-one onto Node. Each content list is `[{type:"input_text", text:"Edit instruction:… Criteria:…"}, {type:"input_image", image_url: dataUrl}, … mask …, output image]`. The call is `client.responses.create(model="gpt-5.2", input=[{role:"system",…},{role:"user",content}], text={"format":{"type":"json_schema","name":…, "schema":…, "strict":True}})` followed by `json.loads(completion.output_text)`. The default schema is `{pass: boolean, reason: string}` — [openai-cookbook …/vision_harness/graders.py](https://github.com/openai/openai-cookbook/blob/main/examples/evals/imagegen_evals/vision_harness/graders.py)
- Refusals: "the API response will include a new field called `refusal`" — [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- Key order: "Outputs will be produced in the same order as the ordering of keys in the schema" — [Azure OpenAI structured outputs (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs). Community reports of exceptions: [OpenAI forum: key ordering issue](https://community.openai.com/t/key-ordering-issue-in-openai-structured-outputs-despite-specified-sequence-in-json-schema/995040)

**(c) Streaming**
- Official Responses stream example (outdated model) — [examples/responses/stream.ts](https://github.com/openai/openai-node/blob/main/examples/responses/stream.ts):
  ```ts
  const runner = openai.responses
    .stream({ model: 'gpt-4o-2024-08-06', input: 'solve 8x + 31 = 2' })
    .on('response.output_text.delta', (diff) => process.stdout.write(diff.delta));
  for await (const event of runner) { /* ... */ }
  const result = await runner.finalResponse();
  ```
- `ResponseStream` attaches a `snapshot` (the full text so far) to every `response.output_text.delta` it emits. `finalResponse()` returns the parsed response. It does **not** partially parse JSON — [src/lib/responses/ResponseStream.ts](https://github.com/openai/openai-node/blob/main/src/lib/responses/ResponseStream.ts) (lines 174–194)
- `ChatCompletionStream` imports `partialParse` from a vendored `partial-json-parser` and emits `content.delta` with `{ snapshot, parsed }` while the JSON is incomplete — [src/lib/ChatCompletionStream.ts](https://github.com/openai/openai-node/blob/main/src/lib/ChatCompletionStream.ts). Official example — [examples/chat-completions/parsing-stream.ts](https://github.com/openai/openai-node/blob/main/examples/chat-completions/parsing-stream.ts):
  ```ts
  const stream = client.chat.completions
    .stream({ model: 'gpt-4o-2024-08-06', messages: [...], response_format: zodResponseFormat(MathResponse, 'math_response') })
    .on('content.delta', ({ snapshot, parsed }) => { console.log('parsed:', parsed); })
    .on('content.done', (props) => { if (props.parsed) console.log(props.parsed.final_answer); });
  await stream.done();
  ```
- The vendored parser is `const partialParse = (input: string) => parseJSON(input, Allow.ALL ^ Allow.NUM)`. Incomplete strings are returned as they grow; incomplete numbers are withheld — [src/_vendor/partial-json-parser/parser.ts](https://github.com/openai/openai-node/blob/main/src/_vendor/partial-json-parser/parser.ts). Upstream is `promplate/partial-json-parser-js` (MIT, pushed 2026-06-01), published on npm as `partial-json@0.1.7` (2024-05-14) — [promplate/partial-json-parser-js](https://github.com/promplate/partial-json-parser-js)

### Inferences
- **Upgrade openai to ^7 for the copilot branch.** Node 22 and zod 3.25.76 already meet v7's requirements. `llm.ts` only uses `chat.completions.create`, which is unchanged, so the upgrade looks low-risk; run `pnpm -F @cutonce/api typecheck`. Without the upgrade, `reasoning: { effort: "none" }` and `keywords` need `as any` casts under 4.104's types. They are forwarded to the API either way.
- **Recommended copilot call.** Responses API with a strict schema (untested sketch):
  ```ts
  const img = (b: Buffer) => ({ type: "input_image" as const, image_url: `data:image/jpeg;base64,${b.toString("base64")}`, detail: "high" as const });
  const stream = client.responses.stream({
    model: "gpt-5.6-luna", reasoning: { effort: "low" }, max_output_tokens: 400,
    instructions: SYSTEM_RULES,                           // blueprint §10 "Prompt contract"
    input: [{ role: "user", content: [
      { type: "input_text", text: contextTable },         // parts table, state, step, chunks, transcript
      { type: "input_text", text: "Image 1: annotated frame (numbered boxes = rows of the parts table)." }, img(annotated),
      { type: "input_text", text: "Image 2: the same frame without marks." }, img(rawFrame),
    ] }],
    text: { format: { type: "json_schema", name: "copilot_answer", strict: true, schema: copilotSchema } },
  });
  ```
- **Build `copilotSchema` per request, not through `toOpenAiSchema(zod)`.** Make `highlight_parts.items` an `enum` of this plan's `part_id`s and `drawing_refs[].chunk_id` an `enum` of the retrieved `chunk_id`s. This applies SIGMA's closed-list grounding (Q3) at the decoder level. Keep the blueprint's post-validation as defence in depth. Put `answer_text` **first**, since key order is generation order (Q6).
- `detail: "high"` on a 1024-px annotated frame is the safe default for reading labels. `"low"` could be tried on the raw frame to save tokens and latency (untested).
- Pass `keywords` built from the selected part's name and aliases plus the visible parts' names to `gpt-transcribe` so domain terms ("cable tray", "grommet") come out right. Set `languages: ["en"]`. Filter keywords for `<`, `>` and newlines, as the guide requires.
- **Mapping onto the endpoint.** Multipart → `toFile(wav, "utterance.wav", { type: "audio/wav" })` → `gpt-transcribe` (3 s timeout) → the regex fast path → `Promise.all([retrieve(), memory lookups, annotateFrame()])` → `responses.stream()` → post-validate → reply JSON.

### Gaps
- No measured latency for `gpt-transcribe` or `gpt-5.6-luna` was found. The model page and the STT guide state none. The blueprint's 0.5–1.0 s and 1.5–3.0 s are estimates and must be measured at T+0.
- I could not confirm from the docs whether `gpt-transcribe` accepts `response_format: "text"` or only `json`/`verbose_json`. The guide mentions "standard and verbose JSON formats".
- The structured-outputs guide page, as fetched, did not show the current limits on enum size, property count or nesting, nor the key-ordering sentence. The key-ordering quote comes from Microsoft's Azure copy of the docs.
- I did not find an official **Node** example that sends two images with a strict schema. The closest official code is the Python cookbook grader above.

---

## Q2. ElevenLabs JS SDK: streaming `eleven_flash_v2_5` as `pcm_22050` into a Fastify reply; latency options

### Takeaway
The package is `@elevenlabs/elevenlabs-js` (MIT, v2.68.0, 2026-09-11). The call is `await el.textToSpeech.stream(voiceId, { text, modelId: "eleven_flash_v2_5", outputFormat: "pcm_22050", optimizeStreamingLatency })`, which returns a web `ReadableStream<Uint8Array>`. Fastify 5 accepts a web `ReadableStream` in `reply.send()` and treats it like a node stream. `optimizeStreamingLatency` (values 0–4) is still present and **not** marked deprecated in the SDK.

### Cited Findings
- `@elevenlabs/elevenlabs-js@2.68.0` (MIT; npm modified 2026-09-11). The repo's last commit is `8cbdc8bd` on 2026-09-11, "SDK regeneration" (the SDK is Fern-generated). The legacy package `elevenlabs@1.59.0` still exists; use the scoped one — [elevenlabs/elevenlabs-js](https://github.com/elevenlabs/elevenlabs-js), [npm](https://www.npmjs.com/package/@elevenlabs/elevenlabs-js)
- README streaming example (uses `eleven_multilingual_v2`; swap the model id) — [README.md](https://github.com/elevenlabs/elevenlabs-js/blob/main/README.md):
  ```ts
  const audioStream = await elevenlabs.textToSpeech.stream("JBFqnCBsd6RMkjVDRZzb", {
      text: "This is a... streaming voice",
      modelId: "eleven_multilingual_v2",
  });
  ```
- Method signature: `public stream(voice_id: string, request: ElevenLabs.StreamTextToSpeechRequest, requestOptions?: TextToSpeechClient.RequestOptions): core.HttpResponsePromise<ReadableStream<Uint8Array>>`. `enableLogging`, `optimizeStreamingLatency` and `outputFormat` go into the **query string** (`optimize_streaming_latency`, `output_format`); the rest is the JSON body. The API key comes from `xi-api-key`, falling back to `process.env.ELEVENLABS_API_KEY` — [src/api/resources/textToSpeech/client/Client.ts](https://github.com/elevenlabs/elevenlabs-js/blob/main/src/api/resources/textToSpeech/client/Client.ts)
- `StreamTextToSpeechRequest` fields: `enableLogging`, `optimizeStreamingLatency?: number` (0 default; 1 is about 50% of the possible improvement; 2 about 75%; 3 max; 4 max plus text normalizer off, which "can mispronounce eg numbers and dates"), `outputFormat`, `text`, `modelId`, `languageCode`, `voiceSettings`, `seed`, `previousText`, `nextText`, `previousRequestIds`, `nextRequestIds`, `usePvcAsIvc` ("temporary workaround for higher latency in PVC versions"), and `applyTextNormalization: 'auto'|'on'|'off'`. The doc comment says "PCM with 44.1kHz sample rate requires … Pro tier", so 22.05 kHz is not restricted — [StreamTextToSpeechRequest.ts](https://github.com/elevenlabs/elevenlabs-js/blob/main/src/api/resources/textToSpeech/client/requests/StreamTextToSpeechRequest.ts)
- The output-format enum includes `Pcm16000: "pcm_16000"`, `Pcm22050: "pcm_22050"`, `Pcm24000: "pcm_24000"` and `Ulaw8000` — [TextToSpeechStreamRequestOutputFormat.ts](https://github.com/elevenlabs/elevenlabs-js/blob/main/src/api/resources/textToSpeech/types/TextToSpeechStreamRequestOutputFormat.ts)
- Model id `eleven_flash_v2_5` is current. There is no newer Flash model. "Ultra-low latency (~75ms†)", with the footnote "Excluding application & network latency". The limit is 40,000 characters per request. Free plan concurrency is 4 — [ElevenLabs models](https://elevenlabs.io/docs/overview/models)
- The latency guide (vendor numbers, not independently measured): Flash is "~75ms inference". TTFB for Flash over websockets is 100–150 ms in North America, Europe and SE Asia. The `api.us.elevenlabs.io` base URL can "opt-out of the global routing and always use USA servers". Use HTTP streaming for text you already have and websockets for LLM text arriving live. With websockets, prefer `auto_mode`, because a fixed chunk schedule can stall. It says "Higher audio quality output formats can increase latency". The page does **not** mention `optimize_streaming_latency` — [Latency optimization](https://elevenlabs.io/docs/developers/best-practices/latency-optimization)
- The SDK tree has generated websocket types for `v1TextToSpeechVoiceIdStreamInput` and `…MultiStreamInput` (text-in over websocket). The README's new "Speech Engine" (`elevenlabs.speechEngine.attach(...)`, which runs its own STT and LLM loop over a WebSocket) is a different product — [elevenlabs-js source tree](https://github.com/elevenlabs/elevenlabs-js/tree/main/src/api/resources)
- Fastify 5 docs: "`ReadableStream` will be treated as a node stream … the content is considered to be pre-serialized". Example: `reply.header('Content-Type','application/octet-stream'); reply.send(ReadableStream.from(stream))`. You can also `reply.send(new Response(readableStream, { status, headers }))`. A stream sent without `Content-Type` gets `application/octet-stream`. There is a special note about stream error handling in `setErrorHandler` — [fastify docs/Reference/Reply.md](https://github.com/fastify/fastify/blob/main/docs/Reference/Reply.md)
- `elevenlabs/examples` (MIT, pushed 2026-09-07) has a Node TTS quickstart at `text-to-speech/typescript/quickstart/example/index.ts` and a Next.js route at `text-to-speech/nextjs/quickstart/example/app/api/generate-speech/route.ts`. I did not open these; they appear to be plain quickstarts with no Fastify or chunked piping — [elevenlabs/examples](https://github.com/elevenlabs/examples)

### Inferences
- **`GET /v1/audio/:turn_id` sketch** (untested). Start ElevenLabs **eagerly** when `answer_text` or its first sentence is known (Q6), not when the GET arrives. Store chunks in a per-turn replay buffer so the headset and the Director page can both fetch it, late joiners start from byte 0, and "promote to cache" can write the WAV:
  ```ts
  const audio = await el.textToSpeech.stream(cfg.voiceId, {
    text, modelId: "eleven_flash_v2_5", outputFormat: "pcm_22050",
    optimizeStreamingLatency: 3, previousText,             // previousText keeps prosody across sentence chunks
  });
  for await (const chunk of audio) turnAudio.push(chunk);  // web ReadableStream is async-iterable in Node 22
  // GET handler: reply.header("content-type","application/octet-stream").header("x-sample-rate","22050");
  //              return reply.send(Readable.from(turnAudio.replayThenFollow()));
  ```
  With no `content-length`, Node's HTTP/1.1 server uses chunked transfer by itself. Send `reply.send(stream)` from an async handler (or `return reply`) so Fastify doesn't double-send.
- Prefer `optimizeStreamingLatency: 3` over 4. Level 4 turns the normalizer off, and answers contain dimensions such as "70 cm" and "40 mm" that it "can mispronounce". The HTTP stream is simpler than the websocket stream-input for two short sentences.
- Point the client at `api.us.elevenlabs.io` (Waterloo is in North America). Check the constructor option name first; see Gaps.
- PCM saved to `demo_cache/` needs a 44-byte WAV header (22050 Hz, mono, 16-bit) to be playable elsewhere.

### Gaps
- I could not verify the byte order of ElevenLabs `pcm_*` (believed to be signed 16-bit little-endian) or the exact `ElevenLabsClient` option for a custom base URL (`baseUrl` vs `environment`). Check `src/Client.ts` before relying on either.
- No independent measurement of Flash v2.5 TTFB from Canada was found. The 100–150 ms figure is the vendor's websocket figure.
- ElevenLabs' docs did not say whether `optimize_streaming_latency` has any effect on Flash v2.5, which is already low-latency.

---

## Q3. Open-source AR and assistant copilots: how they build the context packet, reference objects, and constrain output

### Takeaway
The best open code is **microsoft/psi `Applications/Sigma`** (MIT). Its prompts are templates with `$argN`/`$imageN` slots filled with the *task*, the *current step* and the *utterance*. It grounds entities by asking the model to choose from a supplied closed list or say "it doesn't belong". It constrains output with a `[no-question]` sentinel and one-sentence answers, and it ships **prompt regression test cases** with a minimum accuracy. **QuestCameraKit ImageLLM** (MIT) only shows the naive baseline: the headset calls OpenAI directly with the image and a command, with no context packet or structured output. **arXiv 2511.00730** has no public code.

### Cited Findings
- **SIGMA** (microsoft/psi): LICENSE.txt is MIT. The repo was pushed 2026-09-09; the last commit under `Applications/Sigma` is `79f872d1` on 2024-09-07 (a README link to the arXiv report) — [microsoft/psi Applications/Sigma](https://github.com/microsoft/psi/tree/master/Applications/Sigma)
- The SIGMA prompt library `Applications/Sigma/Sigma/Resources/llmqueries.json` defines 8 queries: GetRecipe, GuideNameExtraction, IdentifyObjectName, ExtractObjects, GetOpenEndedResponse, GetUserContext, GetRecipeWithUserContext, IntentReco-Diamond. Each has `Template`, `TestCases[{ParameterValues, ExpectedResult}]`, `MinimumTestAccuracy`, `Deployment: "gpt-4"`, `Temperature: 0.0` and `SystemMessage` — [llmqueries.json](https://github.com/microsoft/psi/blob/master/Applications/Sigma/Sigma/Resources/llmqueries.json)
  - `GetOpenEndedResponse` (the in-task Q&A prompt): "The human is performing the following task: $arg0 / The human is on this step: $arg1 / The human uttered the following sentence: $arg2. / If this is a question from the human related to this step, please answer the question in a single sentence, in a concise manner. If not, please respond [no-question]". The system message is "a helpful assistant guiding a human via spoken interaction to perform a task in the physical world."
  - `IdentifyObjectName` (entity grounding): "I will give you a sentence that may specify one of the following items: … You will have to guess which item the sentence specifies, or tell me if it doesn't belong …" It uses few-shot examples, including `bicycle → it doesn't belong`, and ends with "Here is the list of items: $arg0 / Sentence: $arg1 / Output:".
- `LLMPrompt.Run(textArgs, imageArgs)` replaces `$argN` and splits the text at each `$imageN`, inserting `ChatMessageImageContentItem(data:image/jpeg;base64,…)` in place. Images are therefore **interleaved at labelled positions in the text**. `RunTestCases(out accuracy)` does exact-match comparison against `ExpectedResult` — [LLMPrompt.cs](https://github.com/microsoft/psi/blob/master/Applications/Sigma/Sigma/LLMQuery/LLMPrompt.cs)
- Task and step structure lives in `Applications/Sigma/Sigma/Task/{Task,Step,DoStep,GatherStep,ComplexStep,SubStep}.cs` and `sigma.state.diamond.tasklibrary.json`. I listed the files but did not read them — [psi tree](https://github.com/microsoft/psi/tree/master/Applications/Sigma/Sigma/Task)
- **QuestCameraKit** (xrdevrob): MIT. Last commit `9e10fcc5` on 2026-09-08. The sample is `Unity-QuestVisionKit/Assets/Samples/5 ImageLLM/Scripts/` (`ImageOpenAIConnector.cs`, `STTManager.cs`, `TTSManager.cs`, `SaveWav.cs`, `VoiceCommandHandler.cs`). The headset POSTs straight to `https://api.openai.com/v1/chat/completions`. The content is `[{type:"text", text: instructions}, {type:"text", text: command}, {type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}]` with `"max_completion_tokens":300` and models `gpt-4o`/`gpt-4o-mini`/`o1`/`gpt-4-turbo`. STT is `whisper-1` with `response_format: "text"` and TTS is `tts-1`. There is no structured output and no object ids, and the API key is held on the device — [QuestCameraKit ImageOpenAIConnector.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/ImageOpenAIConnector.cs), [STTManager.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/STTManager.cs)
- **"Teaching LLMs to See and Guide: Context-Aware Real-Time Assistance in AR"** (Qorbani, Paynabar, Moghaddam; arXiv 2511.00730, v4 2025-11-15). It uses "hand actions, task steps, and dialogue history" and an "incremental prompting framework" evaluated on HoloAssist. **No code link** appears on the arXiv page — [arXiv 2511.00730](https://arxiv.org/abs/2511.00730)

### Inferences
- **Borrow SIGMA's prompt anatomy for Cut Once's user message,** in this fixed order: `TASK` (plan name), `CURRENT STEP` (index, title, instruction), `PARTS TABLE` (mark #, `part_id`, name, state, layer, material, one-line `verify_hint`, with the selected part flagged), `DOCUMENT CHUNKS` (chunk_id, title, text), `LAST 2 TURNS`, then `USER SAID`, followed by the two images, each with a caption. SIGMA's `[no-question]` sentinel maps to `needs_clarification: true`. Its "or tell me if it doesn't belong" maps to allowing `highlight_parts: []` rather than forcing a guess.
- Cut Once goes further than all three projects: ids are **decoder-constrained** by strict-schema `enum`s (Q1). The headset supplies geometry (`visible_parts[].bbox_px`), so the model never has to detect anything.
- **Copy SIGMA's `TestCases` plus `MinimumTestAccuracy` idea** as a vitest fixture. Record 5–10 scripted demo turns (context JSON, JPEG, transcript) and assert that `highlight_parts` ⊆ the expected set and `action` is right. This is the cheapest guard against prompt regressions during the hackathon.
- QuestCameraKit is useful to teammate C for Quest capture and WAV encoding (`SaveWav.cs`). It is an anti-pattern for the server: key on device, no grounding, and deprecated models.

### Gaps
- I found no open-source 2025–2026 **headset copilot that sends a per-object context packet with ids and screen boxes** to a server. SIGMA grounds by names in text and does not project object bounding boxes into the image.
- The full text of arXiv 2511.00730 was not read (only the abstract page), so its prompt structure is unknown.

---

## Q4. Visual prompting with drawn boxes and labels (Set-of-Mark): Node code and evidence

### Takeaway
microsoft/SoM (MIT, dormant since 2024-08) is Python/matplotlib and needs SAM/SEEM segmenters. Cut Once needs only its **idea**: numbered marks plus boxes, and asking the model to cite marks. Port the drawing to Node as a single SVG string composited with `sharp().composite([{ input: Buffer.from(svg), top: 0, left: 0 }])`. The evidence that boxes help is strongest for GPT-4V. Adding boxes to numbers and masks raised Flickr30k R@1 from 84.4 to 89.2. There is no published 2025–2026 figure for GPT-5-class models.

### Cited Findings
- microsoft/SoM: MIT. Last push 2024-08-19. The drawing code is `task_adapter/utils/visualizer.py`. Label placement uses `text_pos = (x0, y0)`, "if drawing boxes, put text on the box corner", and font size scales with region area. The GPT-4V call is in `gpt4v.py`, whose whole "metaprompt" is `- For any marks mentioned in your answer, please highlight them with [].` — [microsoft/SoM](https://github.com/microsoft/SoM), [gpt4v.py](https://github.com/microsoft/SoM/blob/main/gpt4v.py), [visualizer.py](https://github.com/microsoft/SoM/blob/main/task_adapter/utils/visualizer.py)
- Paper (Yang et al., arXiv 2310.11441, v2 2023-11-06): "GPT-4V with SoM in zero-shot setting outperforms the state-of-the-art fully-finetuned referring expression comprehension and segmentation model on RefCOCOg" — [arXiv 2310.11441](https://arxiv.org/abs/2310.11441)
- Numbers from the paper: RefCOCOg REC is 86.4 for GPT-4V+SoM vs 85.8 for PolyFormer, and RES mIoU is 75.6 vs 67.2. On Flickr30K phrase grounding, "Numbers & Mask" scores 84.4 R@1 and "Numbers & Mask & Box" scores 89.2. The paper notes "putting marks at the central locations does not necessarily bring the best performance". Its mark allocation sorts regions by ascending area and uses a distance transform. Users "may need to carefully design the SoM prompts" for images that already contain numbers or text — [arXiv 2310.11441v2 HTML](https://arxiv.org/html/2310.11441v2)
- A 2025 follow-up extends marks to 3D boxes for GPT-4o. It evaluates marks, axis-aligned boxes, oriented boxes and 3D edge points. I did not read it beyond the search listing — [3DAxisPrompt, arXiv 2503.13185](https://arxiv.org/html/2503.13185v1)
- sharp `composite(images)`: "The images to composite must be the same size or smaller than the processed image." `top`/`left` take precedence over `gravity`. **"Any resize, rotate or extract operations in the same processing pipeline will always be applied to the input image before composition."** Input can be a Buffer (SVG works). There is a `density` option for vector overlays, default 72 — [sharp api-composite.md](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/api-composite.md)
- sharp is Apache-2.0, npm 0.35.4 (2026-08-26), repo pushed 2026-09-13 — [lovell/sharp](https://github.com/lovell/sharp)

### Inferences
- **Node port** (untested sketch; `bbox_px` assumed to be `[x, y, w, h]` in camera pixels, as the blueprint example `[812, 210, 96, 540]` suggests; confirm with teammate C):
  ```ts
  const W = 1024, s = W / cam.width, H = Math.round(cam.height * s);
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const marks = [...visible].sort((a, b) => b.bbox_px[2] * b.bbox_px[3] - a.bbox_px[2] * a.bbox_px[3]) // big first, small on top
    .map((p) => { const [x, y, w, h] = p.bbox_px.map((v) => Math.round(v * s)); const c = p.part_id === selected ? "#ff00ff" : p.state === "built" ? "#22c55e" : "#f59e0b";
      const ty = y > 24 ? y - 24 : y; return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="4"/>
      <rect x="${x}" y="${ty}" width="${26 + 10 * String(p.mark).length}" height="24" fill="${c}"/>
      <text x="${x + 5}" y="${ty + 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#000">${esc(String(p.mark))}</text>`; });
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${marks.join("")}</svg>`);
  const annotated = await sharp(jpeg).resize({ width: W }).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 80 }).toBuffer();
  ```
  The SVG must be sized to the **resized** frame, because resize runs before composite in the same pipeline.
- Use **short numeric marks** in the image (SoM style), with the number → `part_id` mapping in the text parts table, rather than long names drawn on the image. Numbers occlude less, and the SoM paper warns about images that already contain text. Colour by state (built, missing, selected) so the model sees state visually. Keep sending the **raw frame** as a second image, as the blueprint already plans, because marks can hide the object under them.
- Adapt SoM's one-line metaprompt: "Refer to marks by their number; output only `part_id`s from the table." The strict `enum` then makes any invalid id impossible.

### Gaps
- There are no published SoM-style ablations for GPT-5.x or `gpt-5.6-luna`. The quantitative evidence is for GPT-4V (2023).
- SVG `<text>` in sharp is rendered by librsvg with system fonts. On a slim Linux container, labels may render as empty boxes if no font is installed. This was not verified this session, so test on the deploy target.
- The licence of sharp's bundled libvips binaries was not re-verified this session (believed LGPL-3.0-or-later, dynamically linked). It doesn't matter for a hackathon server, but note it.

---

## Q5. Verification as a narrow VLM check ("is part X installed?")

### Takeaway
No open-source repo does exactly "photo crop + expected-view render → present/absent/wrong_orientation/unsure" with a hosted VLM. The closest reusable **code** is the OpenAI Cookbook's vision LLM-as-judge (reference images plus candidate image, strict `{pass, reason}` schema on the Responses API), adapted to Cut Once's verdict enum. The closest **designs** are IndustReal's step-completion baselines (per-frame threshold, cumulative confidence with decay, or procedure-order expectation) and PROVIA's rule that "what was done is kept apart from what was accepted", which the blueprint's gating table already follows. IKEA-Bench warns that matching a render or diagram to a photo is a known VLM weakness.

### Cited Findings
- **OpenAI Cookbook vision grader** (MIT). `build_editing_judge_content` interleaves `input_text` (instruction plus criteria), then the reference `input_image`s, then the mask image, then the output image. `LLMajRubricGrader.grade()` calls `responses.create(..., text={"format": {"type":"json_schema", ..., "strict": True}})` and parses `output_text`. It defaults to `judge_model="gpt-5.2"` and supports a custom schema and `result_parser` — [graders.py](https://github.com/openai/openai-cookbook/blob/main/examples/evals/imagegen_evals/vision_harness/graders.py)
- **IndustReal** (TimSchoonbeek; Apache-2.0; last push 2024-08-19): procedure step recognition in `PSR/psr_baseline.py` and `PSR/psr_utils.py`. The three baselines are `"naive"` (per-frame `conf_threshold: 0.5`), `"confidence"` (`cum_conf_threshold: 8`, cumulative, with `cum_decay: 0.75` applied to non-observations) and `"expected"` (uses the known procedure order), "B1, B2, and B3 in the IndustReal paper" — [psr_baseline.py](https://github.com/TimSchoonbeek/IndustReal/blob/main/PSR/psr_baseline.py)
- **PROVIA** (Kratos-Wen, KIT; MIT; source released `aa6f59a9` on 2026-09-17; 0 stars): online mistake detection in egocentric video from past frames only, running at 58–70 fps on CaptainCook4D, IndustReal, HoloAssist and IMPACT-ego. "What was done is kept apart from what was accepted. A factual state remembers the steps each actor performed, mistakes included." The procedure state "advances only in the correct-status branch". Alarms are scored "at a false-alarm budget whose threshold is fixed on validation". It is a trained PyTorch model (marked point process plus automaton), not a VLM prompt — [Kratos-Wen/PROVIA](https://github.com/Kratos-Wen/PROVIA)
- **IKEA-Bench** (Liu, Zhang, Xiao; arXiv 2604.00913, revised 2026-05-27): 19 open VLMs (2B–38B) on 1,623 questions across 29 IKEA products. "diagrams and video occupy disjoint ViT subspaces". "assembly instruction understanding is recoverable via text", but adding text "degrades diagram-to-video alignment". "architecture family predicts alignment accuracy more strongly than parameter count" — [arXiv 2604.00913](https://arxiv.org/abs/2604.00913)
- Related 2025–2026 papers found by search but not read: ProMQA-Assembly (arXiv 2509.02949), a multimodal procedural QA dataset on assembly — [arXiv 2509.02949](https://arxiv.org/pdf/2509.02949)

### Inferences
- **`/verify` request shape** (adapting the cookbook grader; untested):
  ```ts
  content: [
    { type: "input_text", text: `Part: ${part.name}. ${part.verify_hint}. Claimed state: ${req.claimed_state}.` },
    { type: "input_text", text: "Image A: camera photo (cropped)." }, img(photoCrop),
    { type: "input_text", text: "Image B: render from the same viewpoint; magenta = where the part must be if installed; grey = parts already built." }, img(renderCrop),
    { type: "input_text", text: "Is the part physically present in Image A at the magenta location? If the region is occluded, blurry or out of frame, answer unsure." },
  ]
  // schema key order: evidence (string) → verdict (enum present|absent|wrong_orientation|unsure) → confidence (number)
  ```
  Put `evidence` **before** `verdict` so the model describes what it sees before committing. This relies on key order being generation order (Q1). Keep it one sentence to stay within the 8 s timeout.
- **Close the cross-depiction gap IKEA-Bench describes.** Also draw the magenta outline of the expected part (projected from the same pose) onto **Image A**, SoM style. That makes the question local ("is there a black 40 mm tube inside the magenta outline?") instead of relying on the model to align render and photo. A/B test this against the render-only version on logged crops.
- **Confidence handling.** Keep the blueprint's rule that the verdict never writes state and requires confidence ≥ 0.8. For the P1 batch check, IndustReal's B2 is a ready pattern: accumulate "present" evidence across 2–3 frames with decay before suggesting "Mark built?". Treat the model's self-reported `confidence` as an ordinal score to threshold on logged failures, not as a calibrated probability.
- **Likely failure modes to log and tune against** (inferred from the setup, not measured): hands occluding the part; left/right twin parts that look identical (the render location disambiguates, and the crop must include context); thin parts (cables) below crop resolution; passthrough-camera blur; and orientation differences too subtle to see at a 640×480 render.

### Gaps
- I found no open-source repo or paper measuring hosted GPT-class VLM accuracy on a "render vs photo: is the part installed?" task, and no calibration study of VLM self-reported confidence for this use.
- IKEA-Bench's findings are for open 2B–38B models on diagram-to-video, not GPT-5.x on render-to-photo. How far they transfer is unknown.
- The IndustReal paper's B1–B3 accuracy numbers were not retrieved (only the code config).

---

## Q6. Latency: starting TTS on the first sentence before the model finishes (sentence chunking from a streamed JSON field)

### Takeaway
Yes, strict structured output can be streamed. Both SDK stream helpers emit growing text, and the Chat Completions helper even emits a partially parsed object. With `answer_text` as the **first** key in the schema, the server can partial-parse the snapshot, cut completed sentences with a small splitter (livekit agents-js `splitSentences`, Apache-2.0), and start the ElevenLabs Flash stream on sentence 1 while the model is still writing `highlight_parts` and `drawing_refs`.

### Cited Findings
- `ChatCompletionStream` emits `content.delta` with `parsed` (partial) using a vendored partial-JSON parser. `ResponseStream` emits `response.output_text.delta` with a `snapshot` of the accumulated text — [ChatCompletionStream.ts](https://github.com/openai/openai-node/blob/main/src/lib/ChatCompletionStream.ts), [ResponseStream.ts](https://github.com/openai/openai-node/blob/main/src/lib/responses/ResponseStream.ts)
- `partialParse` allows partial strings (it removes only `Allow.NUM`), so a half-written `answer_text` string is returned — [parser.ts](https://github.com/openai/openai-node/blob/main/src/_vendor/partial-json-parser/parser.ts). The standalone MIT package is `partial-json` (npm 0.1.7), from [promplate/partial-json-parser-js](https://github.com/promplate/partial-json-parser-js). An event-based streaming alternative is `@streamparser/json@0.0.26` (MIT, npm modified 2026-08-21) — [npm @streamparser/json](https://www.npmjs.com/package/@streamparser/json)
- Outputs follow the schema's key order — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs), with community-reported exceptions — [OpenAI forum](https://community.openai.com/t/key-ordering-issue-in-openai-structured-outputs-despite-specified-sequence-in-json-schema/995040)
- livekit agents-js (Apache-2.0, SPDX header in the file; `sentence.ts` last changed `7e367279` on 2026-08-12) exports `splitSentences(text, minLength = 20, retainFormat = false): [string, number, number][]`. It protects abbreviations (Mr, Dr, Inc…), acronyms, websites and decimal digits, then splits on `.`, `?` and `!`. `basic.ts` exposes `class SentenceTokenizer` with `tokenize()` and `stream()`, defaults `minSentenceLength: 20` and `streamContextLength: 10` — [sentence.ts](https://github.com/livekit/agents-js/blob/main/agents/src/tokenize/basic/sentence.ts), [basic.ts](https://github.com/livekit/agents-js/blob/main/agents/src/tokenize/basic/basic.ts)
- pipecat (BSD-2-Clause, pushed 2026-09-19) is the Python reference for LLM → sentence aggregation → TTS pipelines. I did not read its code — [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat)
- ElevenLabs: HTTP streaming suits text you already have, and websockets suit live LLM text. Flash inference is ~75 ms and North American TTFB 100–150 ms (vendor figures) — [ElevenLabs latency guide](https://elevenlabs.io/docs/developers/best-practices/latency-optimization). `previousText` and `previousRequestIds` keep continuity across separately generated clips — [StreamTextToSpeechRequest.ts](https://github.com/elevenlabs/elevenlabs-js/blob/main/src/api/resources/textToSpeech/client/requests/StreamTextToSpeechRequest.ts)

### Inferences
- **Pattern for Cut Once** (untested). `answer_text` is capped at two short sentences, so at most two TTS requests are needed:
  ```ts
  let spoken = 0; // characters of answer_text already sent to TTS
  stream.on("response.output_text.delta", ({ snapshot }) => {
    const ans: string | undefined = partialParse(snapshot)?.answer_text;   // from "partial-json"
    if (!ans) return;
    const done = splitSentences(ans.slice(spoken)).slice(0, -1);           // the last piece may still be growing
    for (const [s] of done) { turnAudio.enqueue(s); spoken = ans.indexOf(s, spoken) + s.length; }
  });
  // on finalResponse(): enqueue the remaining tail of answer_text, then post-validate ids and reply JSON
  ```
  `turnAudio.enqueue` runs the ElevenLabs requests one after another, passing `previousText`, and appends PCM to the per-turn replay buffer served by `GET /v1/audio/:turn_id` (Q2).
- Don't use livekit's `splitSentences` default `minLength = 20` as is for the first chunk. A 10-character first sentence ("Yes, it is.") should still go immediately. Copying the ~60-line function (Apache-2.0: keep the notice) is simpler than depending on `@livekit/agents`.
- **Risk: speech starts before validation.** Spoken text can't be retracted when post-validation later drops a `part_id` or the JSON fails. Mitigations:
  - Tell the model to speak part **names**, never ids.
  - Validate ids only in `highlight_parts`.
  - Abort the TTS queue and fall back to the cached answer or text only on a refusal or parse error.
- **Is it worth it?** The saving is only the model's time to write the fields after `answer_text` plus the headset's JSON round trip before its GET. For a 2-sentence answer and a short tail, that is probably a few hundred ms (not measured). If time is short, the simpler order is to finish the model call, then start ElevenLabs as soon as the JSON is final on the server (before replying) and buffer, rather than waiting for the headset's GET. That alone takes the TTS first-byte (~100–150 ms vendor TTFB) off the critical path.
- **Ordering trade-off.** Putting `answer_text` before `highlight_parts` means the model commits to words before choosing ids. With `reasoning.effort` at `low` it still reasons internally first, but at `none` answer quality could drop. A/B `effort: "none"` vs `"low"` on the scripted demo questions and log `timings_ms`.

### Gaps
- No measured end-to-end numbers were found for "LLM JSON stream → first sentence → ElevenLabs first byte" in Node. All savings above are estimates.
- Whether `gpt-5.6-luna` with `effort: "none"` streams `output_text` deltas smoothly or in bursts is undocumented.
- I didn't check whether the Responses stream helper supports `text.format` via `zodTextFormat` inside `.stream()` (the examples show it only in `.parse()`). Passing a raw JSON-schema `text.format` to `.stream()` is type-valid per `ResponseFormatTextJSONSchemaConfig`.
