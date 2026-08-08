"""
Low-latency call pipeline for Vobiz's bidirectional media stream.

Rewritten to use Vobiz's OWN official Pipecat integration package
(`pipecat-vobiz` on PyPI — see requirements.txt) instead of a hand-rolled
serializer. That change fixes real, confirmed-against-source bugs the old
hand-rolled version had:

  - Outbound audio must be sent as `{"event": "playAudio", "media": {...}}`
    — the old code sent `{"event": "media", ...}`, which Vobiz's server
    does not recognize as a valid inbound-to-Vobiz message at all, so even
    with every import fixed the caller would never have heard anything.
  - Barge-in/interruption must send `{"event": "clearAudio", ...}`, not
    `{"event": "clear", ...}`.
  - The exact `start` event field names (`streamId`, `callId`,
    `mediaFormat.encoding`, `mediaFormat.sampleRate`) are now read via
    `parse_vobiz_start()`, which is Vobiz's own helper, instead of the old
    code's defensive multi-key guessing.

Replaces the per-turn HTTP+XML round trip in vobiz_webhook.py's Gather
flow with one persistent WebSocket: caller audio streams in continuously,
STT/LLM/TTS run as a pipeline, and reply audio streams back as it's
generated — instead of "wait for full reply, then POST a new webhook".

Only used when the company's resolved TTS provider is "sarvam" or
"deepgram" (see resolve_tts_provider in app/services/tts/providers.py).
"vobiz" as a provider stays on the existing XML <Speak>/<Gather> flow,
since Vobiz has no standalone synthesize API to plug in here.
"""
import logging
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Auto call-cut on caller silence ─────────────────────────────────────────
# If the callee picks up and never says anything (or goes silent mid-call),
# the pipeline previously just sat there indefinitely — the caller could
# leave the line open with dead air for the whole call, burning minutes
# with no way to end automatically. SILENCE_NUDGE_SECONDS is how long to
# wait after the last thing we heard (or the greeting finishing) before
# playing one "are you there?" prompt; SILENCE_HANGUP_SECONDS is how much
# additional silence after that nudge before the call is auto-disconnected.
SILENCE_NUDGE_SECONDS: float = 10.0
SILENCE_HANGUP_SECONDS: float = 10.0  # measured from the nudge, not from the original silence start


async def run_vobiz_stream_pipeline(
    websocket,
    call_uuid: str,
    company: Any,
    lead: Any,
    mode: str,
    greeting: str,
) -> None:
    """
    Entry point called by the /api/v1/vobiz-stream/media-stream WebSocket
    route, AFTER websocket.accept() has already been called there.

    Builds and runs one Pipecat pipeline for the lifetime of this call.
    """
    # Imports are local to this function so importing this module doesn't
    # hard-require pipecat/pipecat-vobiz unless this streaming path is
    # actually used (the "vobiz" native provider never touches this file).
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams
    from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
    from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
    from pipecat.frames.frames import TTSSpeakFrame, TranscriptionFrame, TextFrame, EndFrame
    import asyncio
    from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineParams, PipelineTask
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
    )
    from pipecat.serializers.vobiz import VobizFrameSerializer, parse_vobiz_start
    from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )
    from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
    from pipecat.turns.user_turn_strategies import UserTurnStrategies

    from app.core.config import settings
    from app.services.llm.prompts import build_hindi_prompt

    def _resolve_tts_provider(requested: str, language: str) -> tuple[str, Optional[str]]:
        """
        Guards against picking a TTS provider that can't actually speak the
        requested language. Inlined here (rather than imported from
        app/services/tts/providers.py) because that file is currently
        entirely commented out in this codebase — if you restore it later,
        feel free to swap this back to an import instead.

        Deepgram Aura-2 doesn't support Hindi as of writing (confirmed via
        developers.deepgram.com/docs/tts-models — en/es/de/fr/nl/it/ja only),
        so Hindi/Hinglish calls requesting "deepgram" fall back to "sarvam".
        """
        DEEPGRAM_AURA_SUPPORTED_LANGS = {"en", "es", "de", "fr", "nl", "it", "ja"}
        provider = (requested or "vobiz").lower()
        lang_short = (language or "hi").lower().split("-")[0]
        if provider == "deepgram" and lang_short not in DEEPGRAM_AURA_SUPPORTED_LANGS:
            warning = (
                f"Deepgram Aura-2 does not support language='{language}' — "
                f"falling back to sarvam for this call."
            )
            return "sarvam", warning
        return provider, None

    # ── Read Vobiz's authoritative "start" event off the socket FIRST ──────
    # This is a raw websocket.receive_text() call — it must happen before
    # the Pipecat transport starts its own receive loop, and it's what
    # tells us the real streamId/callId and the wire audio format Vobiz
    # actually negotiated (mediaFormat), rather than guessing/assuming.
    parsed = await parse_vobiz_start(websocket)
    logger.info(
        f"Vobiz stream start | call_uuid={call_uuid[:12] if call_uuid else '?'} | "
        f"streamId={parsed['stream_id']!r} callId={parsed['call_id']!r} "
        f"mediaFormat=({parsed['encoding']!r}, {parsed['sample_rate']})"
    )
    vobiz_call_id = parsed["call_id"] or call_uuid
    vobiz_sample_rate = parsed["sample_rate"] or 8000
    vobiz_encoding = parsed["encoding"] or "audio/x-mulaw"

    language_code = "hi-IN" if mode != "english" else "en-US"
    provider, warning = _resolve_tts_provider(
        getattr(company, "tts_provider", "vobiz"), language_code,
    )
    if warning:
        logger.warning(f"call_uuid={call_uuid[:12]} | {warning}")

    gender = (getattr(company, "voice_gender", None) or "female").lower()
    voice_override = getattr(company, "tts_voice", None)

    # Per-company Vobiz credentials for every real customer — no fallback
    # to a shared/global .env credential for them. Each customer must set
    # their own vobiz_auth_id/vobiz_auth_token in Settings; without it,
    # this stream's TTS (Vobiz's own Speak Text API, used to send audio
    # back on this same call) will 401 rather than silently running under
    # someone else's account.
    #
    # ONE exception: the shared demo account (company.is_demo_account).
    # Falls back to settings.VOBIZ_AUTH_ID/VOBIZ_AUTH_TOKEN from .env only
    # for that account, and only for whichever field is left blank — real
    # customer accounts are unaffected.
    vobiz_auth_id = getattr(company, "vobiz_auth_id", None) or ""
    vobiz_auth_token = getattr(company, "vobiz_auth_token", None) or ""
    if getattr(company, "is_demo_account", False) and (not vobiz_auth_id or not vobiz_auth_token):
        vobiz_auth_id = vobiz_auth_id or (settings.VOBIZ_AUTH_ID or "")
        vobiz_auth_token = vobiz_auth_token or (settings.VOBIZ_AUTH_TOKEN or "")
    if not vobiz_auth_id or not vobiz_auth_token:
        logger.error(f"call_uuid={call_uuid[:12]} | No Vobiz credentials set for this company — set vobiz_auth_id/vobiz_auth_token in Settings")

    # ── Transport: Vobiz <-> Pipecat over the raw WebSocket ────────────────
    serializer = VobizFrameSerializer(
        stream_id=parsed["stream_id"],
        call_id=vobiz_call_id,
        auth_id=vobiz_auth_id,
        auth_token=vobiz_auth_token,
        params=VobizFrameSerializer.InputParams(
            vobiz_sample_rate=vobiz_sample_rate,
            encoding=vobiz_encoding,
            sample_rate=None,  # take pipeline rate from StartFrame.audio_in_sample_rate below
            auto_hang_up=True,   # sends {"event":"stop"} + REST DELETE safety net on EndFrame
        ),
    )
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,   # CRITICAL for telephony — raw frames, no WAV container
            serializer=serializer,
            # NOTE: vad_analyzer does NOT go here in pipecat 1.x — it's a
            # silent no-op on the transport. It's wired on
            # LLMUserAggregatorParams below instead.
        ),
    )

    # ── STT: Deepgram streaming (Nova-2 supports Hindi via language="hi") ──
    # Deepgram's default endpointing finalizes very eagerly on brief mid-
    # sentence pauses — confirmed in call logs: one continuous caller
    # utterance ("...call to location available at... apartment.") came
    # through as TWO separate "final" transcripts, and each one
    # independently triggered LLMUserAggregator's
    # TranscriptionUserTurnStartStrategy → a full LLM inference cycle. The
    # result was two uncoordinated bot responses stacked back to back with
    # no user turn between them, each answering a different half of the
    # same sentence — which read as the bot ignoring what was actually
    # asked. `utterance_end_ms` tells Deepgram to hold off finalizing
    # until a real pause (not just a breath), giving one coherent final
    # per turn instead of fragments.
    stt = DeepgramSTTService(
        api_key=settings.DEEPGRAM_API_KEY,
        model="nova-2",
        language="hi" if mode != "english" else "en",
        live_options=LiveOptions(
            interim_results=True,
            utterance_end_ms="1200",
            vad_events=True,
            endpointing=300,
        ),
    )

    # ── LLM: reuse whichever provider is already configured for this app ──
    llm = _build_llm_service(settings)
    _warm_up_llm_provider(settings)  # fire-and-forget — see docstring below

    # ── TTS: Sarvam or Deepgram Aura, per resolve_tts_provider() above ─────
    tts, tts_sample_rate = _build_tts_service(provider, settings, gender, voice_override, language_code)

    system_prompt = build_hindi_prompt(company, lead, rag_context="", mode=mode)
    # Tell the model directly, in the prompt, that it already greeted —
    # rather than relying on the greeting showing up as an assistant turn
    # in context. That still depended on frame/pipeline timing: if the
    # caller says anything before the greeting audio finishes playing
    # (confirmed happening — background noise or an early "Hello?" is
    # common), the LLM gets invoked before context_aggregator.assistant()
    # has captured the greeting, sees no assistant turns at all, and
    # reintroduces itself in its own words. This is deterministic instead
    # — always true regardless of when the model first gets invoked.
    system_prompt += (
        f"\n\nAap PEHLE SE HI is greeting ke saath call shuru kar chuke hain: "
        f"\"{greeting}\"\nISKO DOBARA MAT BOLNA — na khud ko fir se introduce "
        f"karein, na yeh greeting repeat karein. Seedha conversation continue "
        f"karein jaise aapne abhi yeh bola hai."
    )
    context = LLMContext(
        messages=[
            {"role": "system", "content": system_prompt},
        ]
    )
    context_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            # start_secs raised slightly above pipecat's default (0.2 -> 0.3):
            # logs showed frequent barge-in interruptions firing very close
            # together with TTS starting, consistent with brief noise/breath
            # sounds being treated as a real interruption and cutting the
            # bot's own reply off mid-sentence. 0.3s requires marginally more
            # sustained speech before confirming a real interruption, without
            # making genuine fast barge-ins feel sluggish. If real
            # interruptions start feeling delayed, drop this back toward 0.2.
            # min_volume/confidence left at Silero's defaults (0.6/0.7) were
            # tuned for clean browser-mic input. Phone audio arrives here as
            # compressed 8kHz mulaw over a carrier network — generally
            # quieter and noisier — so that threshold could reject legitimate
            # but softer-spoken caller audio as silence, which is consistent
            # with "the bot doesn't seem to hear the caller" reports. Lowered
            # both to be more permissive for telephony-quality audio.
            vad_analyzer=SileroVADAnalyzer(params=VADParams(start_secs=0.3, confidence=0.5, min_volume=0.35)),
            # THE main latency fix: pipecat's default turn-stop strategy is
            # TurnAnalyzerUserTurnStopStrategy(LocalSmartTurnAnalyzerV3()),
            # and LocalSmartTurnAnalyzerV3's default SmartTurnParams.stop_secs
            # is 3.0 — a hard 3-second silence fallback used whenever the
            # semantic "is this sentence finished?" model isn't confident.
            # That fallback is exactly what the logs showed ("End of Turn
            # complete due to stop_secs. Silence in ms: 3000.0") — a flat 3s
            # tax added on top of STT+LLM+TTS time, independent of Vobiz or
            # network latency entirely. Dropping it to 1.0s keeps the
            # semantic model's benefit (it still fires immediately when
            # confident — see the 200ms-ish COMPLETE results in the logs)
            # while capping the worst case. If real calls start getting cut
            # off mid-sentence, raise this — don't drop it all the way back
            # to 3.0 first, try 1.5-2.0.
            user_turn_strategies=UserTurnStrategies(
                stop=[TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3(params=SmartTurnParams(stop_secs=1.0))
                )],
            ),
        ),
    )

    # Mutable holder (plain dict, not a local var) so the nested watchdog
    # coroutine and _LiveTap.process_frame above can both read/write the
    # same state without needing `nonlocal` on every access.
    _silence_state = {"last_activity": datetime.utcnow(), "nudged": False}
    _watchdog_holder: dict = {}

    async def _silence_watchdog() -> None:
        """Auto-disconnects a call where the caller picked up but never
        said anything, or went silent partway through — see the module
        docstring above SILENCE_NUDGE_SECONDS for why this exists. Plays
        one gentle nudge, then hangs up if there's still no response."""
        try:
            while True:
                await asyncio.sleep(1.0)
                idle = (datetime.utcnow() - _silence_state["last_activity"]).total_seconds()
                if not _silence_state["nudged"] and idle >= SILENCE_NUDGE_SECONDS:
                    _silence_state["nudged"] = True
                    _silence_state["last_activity"] = datetime.utcnow()
                    nudge_text = (
                        "Hello? Are you still there?" if mode == "english"
                        else "Hello? Kya aap wahin hain? Main aapki awaaz nahi sun paa raha hoon."
                    )
                    logger.info(f"Silence nudge | call_uuid={call_uuid[:12]}")
                    await task.queue_frames([TTSSpeakFrame(text=nudge_text)])
                elif _silence_state["nudged"] and idle >= SILENCE_HANGUP_SECONDS:
                    logger.info(f"Silence timeout — auto-disconnecting call | call_uuid={call_uuid[:12]}")
                    farewell = (
                        "I'm not getting a response, so I'll disconnect now. Thank you!" if mode == "english"
                        else "Lagta hai koi jawab nahi mil raha, isliye main call disconnect kar raha hoon. Dhanyavaad!"
                    )
                    await task.queue_frames([TTSSpeakFrame(text=farewell)])
                    await asyncio.sleep(2.5)  # let the farewell audio actually play before hanging up
                    await task.queue_frames([EndFrame()])
                    return
        except asyncio.CancelledError:
            pass

    class _LiveTap(FrameProcessor):
        """Passes every frame through completely unchanged — this must
        never alter the pipeline's behavior, only observe it. Does two
        things with user/assistant text as it flows through:
          1. Mirrors it to the Live Call tab via live_broadcaster (fixes
             the "just says Connecting" issue — see earlier fix).
          2. Records it via session_manager.add_turn() — this is what
             builds session["history"], which post-call analysis below
             reads to build the transcript. Nothing was calling
             add_turn() before, so history stayed [] for the whole call
             — which is the actual reason summary/sentiment/lead-status
             were always blank: analyze_call() either never ran (see
             below) or would have gotten an empty transcript even if it
             had.
        """
        def __init__(self, kind: str):
            super().__init__()
            self._kind = kind

        async def process_frame(self, frame, direction: FrameDirection):
            await super().process_frame(frame, direction)
            text = getattr(frame, "text", None)
            if text and isinstance(frame, (TranscriptionFrame, TextFrame)):
                from app.api.routes.live_ws import live_broadcaster
                from app.services.telephony.call_session import session_manager
                role = "user" if self._kind == "user" else "assistant"
                await session_manager.add_turn(call_uuid, role, text)
                if self._kind == "user":
                    # Caller actually said something — reset the silence
                    # watchdog below so it doesn't nudge/hang up mid-turn.
                    _silence_state["last_activity"] = datetime.utcnow()
                    _silence_state["nudged"] = False
                    await live_broadcaster.user_msg(company.id, call_uuid, text)
                else:
                    await live_broadcaster.ai_msg(company.id, call_uuid, text)
            await self.push_frame(frame, direction)

    pipeline = Pipeline([
        transport.input(),
        stt,
        _LiveTap("user"),
        context_aggregator.user(),
        llm,
        _LiveTap("ai"),
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=vobiz_sample_rate,
            audio_out_sample_rate=tts_sample_rate,  # native TTS rate — VobizFrameSerializer resamples to 8kHz for the wire
            allow_interruptions=True,
            enable_metrics=True,
        ),
    )

    # Speak the pre-built greeting directly via TTS the moment the socket
    # is live — mirrors what the XML flow's <Speak> greeting did, but
    # through the selected provider instead of Vobiz's own (Hindi-incapable)
    # Speak verb. Deliberately NOT routed through the LLM: that would cost
    # a full LLM round trip before the caller hears anything, AND the LLM
    # would generate its own opening line instead of speaking the actual
    # configured `greeting` text.
    _call_started_at = datetime.utcnow()

    @transport.event_handler("on_client_connected")
    async def _on_connected(_transport, _client):
        logger.info(f"Vobiz stream pipeline — client connected, speaking greeting | call_uuid={call_uuid[:12]}")
        from app.api.routes.live_ws import live_broadcaster
        await live_broadcaster.call_answered(company.id, call_uuid)
        await task.queue_frames([TTSSpeakFrame(text=greeting)])
        # Greeting is spoken directly (see comment above) rather than
        # through the LLM, so it never passes through the _LiveTap("ai")
        # hook in the pipeline — mirror it to Live Call AND record it in
        # session history manually so the transcript used for post-call
        # analysis doesn't start with a gap either.
        from app.services.telephony.call_session import session_manager
        await session_manager.add_turn(call_uuid, "assistant", greeting)
        await live_broadcaster.ai_msg(company.id, call_uuid, greeting)

    # Start the silence timer only once the greeting audio has actually
    # finished PLAYING (not the moment it's queued for TTS). Starting it
    # at queue-time meant the ~6-8s it takes to generate + play the
    # greeting was already eating most of SILENCE_NUDGE_SECONDS, leaving
    # the caller almost no real time to respond before the "Hello? Are
    # you there?" nudge fired — confirmed in call logs where the nudge
    # landed ~0.1s after the bot finished speaking. The watchdog task
    # itself is also only created here now, once, on first bot-stopped
    # event, guarded by _watchdog_holder so later utterances (nudges,
    # normal replies) don't spawn duplicate watchdog loops.
    @transport.event_handler("on_bot_stopped_speaking")
    async def _on_bot_stopped_speaking(_transport, _client):
        _silence_state["last_activity"] = datetime.utcnow()
        _silence_state["nudged"] = False
        if "task" not in _watchdog_holder:
            _watchdog_holder["task"] = asyncio.create_task(_silence_watchdog())

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_transport, _client):
        logger.info(f"Vobiz stream pipeline — client disconnected | call_uuid={call_uuid[:12]}")
        watchdog_task = _watchdog_holder.get("task")
        if watchdog_task:
            watchdog_task.cancel()
        from app.api.routes.live_ws import live_broadcaster
        duration = int((datetime.utcnow() - _call_started_at).total_seconds())
        # Immediate broadcast only, for a snappy Live Call UI update the
        # instant the media stream drops. The actual session finalize —
        # post-call analysis (summary/sentiment/lead-status) + DB writes
        # — happens exactly once, in vobiz_webhook.py's /hangup route,
        # which is the authoritative Vobiz-side call-end event (it also
        # already owns clearing the batch dispatch lock). This handler
        # used to ALSO call session_manager.end() + run the full
        # analysis/DB-write here, which raced with /hangup doing the same
        # thing on the same call_uuid — session_manager.end() deletes the
        # Redis session on first call, so whichever of the two fired
        # first "won" and the other silently no-op'd. If the winner threw
        # partway through (e.g. analyze_call() erroring), the session was
        # already gone and there was no fallback — which matches the
        # intermittent "lead status / call status / summary just didn't
        # update" reports. One source of truth now.
        await live_broadcaster.call_end(company.id, call_uuid, duration)
        await task.cancel()

    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)


def _build_llm_service(settings):
    """Mirrors settings.LLM_PROVIDER (groq | openai | anthropic) already
    used elsewhere in this app, so switching providers doesn't require
    touching this file."""
    provider = (settings.LLM_PROVIDER or "groq").lower()

    if provider == "groq":
        from pipecat.services.groq.llm import GroqLLMService
        return GroqLLMService(
            api_key=settings.GROQ_API_KEY,
            settings=GroqLLMService.Settings(model=settings.GROQ_MODEL),
        )
    if provider == "anthropic":
        from pipecat.services.anthropic.llm import AnthropicLLMService
        return AnthropicLLMService(
            api_key=settings.ANTHROPIC_API_KEY,
            settings=AnthropicLLMService.Settings(model=settings.ANTHROPIC_MODEL),
        )
    from pipecat.services.openai.llm import OpenAILLMService
    return OpenAILLMService(
        api_key=settings.OPENAI_API_KEY,
        settings=OpenAILLMService.Settings(model=settings.OPENAI_MODEL),
    )


def _build_tts_service(
    provider: str, settings, gender: str, voice_override: Optional[str], language_code: str,
):
    """
    Uses Pipecat's own maintained TTS service classes (not the hand-rolled
    clients in app/services/tts/providers.py — those stay as a non-Pipecat
    fallback/reference; Pipecat's built-ins are tested against real
    accounts and handle reconnect/backoff already).

    Returns (service, native_sample_rate) — the caller sets
    PipelineTask's audio_out_sample_rate to match, and lets
    VobizFrameSerializer's own resampler handle downconverting to Vobiz's
    8kHz wire format, rather than forcing the TTS engine itself to
    synthesize at 8kHz (lower fidelity than its natural rate).
    """
    if provider == "sarvam":
        from pipecat.services.sarvam.tts import SarvamTTSService
        from pipecat.transcriptions.language import Language
        # bulbul:v3 (not v2): Sarvam's own docs position v2 as the "standard"
        # model and v3 as "advanced ... with temperature control" — v2 is
        # the one that tends to sound flat/robotic; v3 is the fix, not a
        # tuning knob on v2. v3 also natively synthesizes at 24kHz (v2: only
        # 22050) — matched below instead of forcing 8kHz at the source.
        default_voice = ("priya" if gender == "female" else "rahul")
        return (
            SarvamTTSService(
                api_key=settings.SARVAM_API_KEY,
                sample_rate=24000,  # bulbul:v3's native rate — see docstring above
                settings=SarvamTTSService.Settings(
                    voice=voice_override or default_voice,
                    model="bulbul:v3",
                    language=Language.HI,
                    temperature=0.7,  # v3-only: more natural/expressive than v2's flat default; try 0.5-0.9 to taste
                ),
            ),
            24000,
        )
    if provider == "deepgram":
        from pipecat.services.deepgram.tts import DeepgramTTSService
        default_voice = "aura-2-luna-en" if gender == "female" else "aura-2-orion-en"
        return (
            DeepgramTTSService(
                api_key=settings.DEEPGRAM_API_KEY,
                voice=voice_override or default_voice,
                sample_rate=8000,
            ),
            8000,
        )
    raise ValueError(
        f"'{provider}' has no Pipecat streaming path — this function should only "
        f"be called after resolve_tts_provider() has already ruled out 'vobiz'"
    )


def _warm_up_llm_provider(settings) -> None:
    """
    Fires a tiny, throwaway completion request in the background the
    moment the pipeline starts, purely to pay Groq/Anthropic/OpenAI's
    TLS+connection-pool cold-start cost before the caller's real first
    turn needs an answer. Logs showed this cold start costing ~2s on turn
    1 (Groq TTFB 2.019s) vs ~0.36s on turn 2 once the connection was warm
    — this closes that gap for the very first turn too. Fire-and-forget:
    failures here are silently ignored, since this is purely an
    optimization and the real request will just pay the cold-start cost
    itself if this fails.
    """
    import asyncio

    async def _ping():
        try:
            provider = (settings.LLM_PROVIDER or "groq").lower()
            if provider == "groq":
                from groq import AsyncGroq
                client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                await client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[{"role": "user", "content": "hi"}],
                    max_tokens=1,
                )
            # Anthropic/OpenAI warmup skipped for now — Groq is the default
            # LLM_PROVIDER and the one the logs showed the cold-start hit
            # on. Add equivalent pings here if you switch LLM_PROVIDER and
            # see the same first-turn TTFB spike on those instead.
        except Exception as e:
            logger.debug(f"LLM warmup ping failed (non-fatal, ignored): {e}")

    asyncio.create_task(_ping())
