# VoicePad speech-to-text bake-off, 2026-10-14

Word error rate (WER, %), lower is better. Yorùbá/Igbo/Hausa show "with tone marks (ignoring tone marks and subdots)".
Pidgin is scored after mapping common spelling variants (di/the, dem/them, pipo/people…), because Pidgin has no fixed spelling.

| Engine | Nigerian English | Pidgin | Yorùbá | Igbo | Hausa | Michael's notes | Names/slang probe |
|---|---|---|---|---|---|---|---|
| Groq Whisper large-v3-turbo (today) | 4.8 | 28.3 | 88.5 (70.8) | 88.1 (84.8) | 98.2 (97.8) | 7.6 | 20.3 |
| Groq Whisper large-v3 | 6.0 | 41.7 | 92.9 (76.5) | 86.4 (81.5) | 91.2 (90.7) | – | – |
| Deepgram nova-3 multi | 8.3 | 32.9 | 97.3 (88.9) | 95.1 (93.8) | 109.7 (104.9) | 13.0 | 16.5 |
| OpenAI gpt-4o-transcribe | 6.0 | 69.6 | 77.4 (62.4) | 86.8 (82.7) | 59.3 (58.0) | 9.7 | 3.8 |
| OpenAI gpt-4o-mini-transcribe | 4.8 | 26.1 | 91.2 (65.5) | 90.5 (88.1) | 62.4 (61.1) | 10.5 | 12.7 |
| ElevenLabs Scribe v2 | 3.0 | 12.4 | 39.4 (20.8) | 29.6 (21.8) | 19.9 (15.0) | 2.9 | 5.1 |
| Gemini 3.5 Flash-Lite | 25.6 | 18.4 | 65.9 (36.7) | 95.9 (82.3) | 38.5 (34.5) | 11.8 | 8.9 |

Test set (21 clips, about 12 minutes, plus 5 extra):
- Yorùbá 4 clips, Igbo 5, Hausa 5: Google FLEURS test split (read speech, human transcripts), joined into ~30-45 s clips with 0.5 s pauses.
- Pidgin 4 clips: asr-nigerian-pidgin/nigerian-pidgin-1.0 test split (human transcripts).
- Nigerian-accented English 3 clips: benjaminogbonna/nigerian_accented_english_dataset test split.
- Michael's own WhatsApp voice notes, 3 excerpts (24-40 s). Reference = consensus of 4 engines, checked by hand for agreement, NOT checked by ear.
- Names/slang probe: 2 SYNTHETIC clips (ElevenLabs TTS, Nigerian voices) with Olaoluwa, Chukwuemeka, Oluwaseun, Ogunleye, Ngozi Okonkwo, Funmilayo, abeg, dey, wahala, nawa o. Synthetic, so only a vocabulary check.

Notes:
- OpenAI gpt-4o(-mini)-transcribe and Gemini Flash-Lite often stop after the first pause and drop the rest (that is most of their error on English/Pidgin).
- Scribe's own language label is unreliable for Yorùbá/Hausa (it said "gle"/"fil"), so the server tags the language from the text (Groq gpt-oss-120b): 26/26 correct on this set.
- Not reachable today: Spitch and Intron (need an account and key), Gemini 3.x Flash (Michael's free keys answered 503 "high demand" all afternoon).

Latency, measured from the build box (US) straight to each API, same 34 s and 283 s clips:
- deepgram-nova3-multi: 30s 0.37s, 30s 0.43s, 5min 0.78s
- groq-turbo: 30s 0.35s, 30s 0.37s, 5min 0.87s
- groq-v3: 30s 0.65s, 30s 0.57s, 5min 4.92s
- gemini-3.5-flash-lite: 30s 1.73s, 30s 1.4s, 5min 4.91s
- elevenlabs-scribe-v2: 30s 0.92s, 30s 1.02s, 5min 7.23s
- openai-4o-mini-transcribe: 30s 14.83s, 30s 33.64s, 5min 22.38s
- openai-4o-transcribe: 30s 15.07s, 30s 33.79s, 5min 25.35s
(OpenAI times went through a proxy and are not comparable.)

v2 server pipeline (branch stt-v2):
- Scribe v2 on the whole set through the v2 server: en 3.0, pcm 10.2, yo 38.5, ig 29.6, ha 19.0.
- Long notes are cut at pauses into ~60 s pieces sent in parallel: 27-min note 47.6 s whole -> 11-15 s; 5-min note 7.2 s -> ~4 s.
- Without a Scribe key (fallback: Groq, Gemini for non-English): yo 67-75, ig 91-93, ha 54-61, en/pcm as today.
