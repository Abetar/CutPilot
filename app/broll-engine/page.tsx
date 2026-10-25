"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { useBrollLibrary } from "@/components/BrollLibraryProvider";
import { BrollEngineMatchList } from "@/components/BrollEngineMatchList";
import {
  useVideoSession,
  type EditPlan as SessionEditPlan,
  type Transcription as SessionTranscription,
} from "@/components/VideoSessionProvider";
import {
  buildBrollEngineRenderPlan,
  type BrollEngineRenderPlan,
} from "@/lib/broll-engine/buildRenderPlan";
import {
  renderVoiceOverVideo,
  type VoiceOverRenderProgress,
} from "@/lib/broll-engine/renderVoiceOverVideo";
import { getBrollFile } from "@/lib/broll/localLibrary";

type AudioFileState = {
  file: File;
  url: string;
};

type TranscriptionSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscriptionWord = {
  word: string;
  start: number;
  end: number;
};

type TranscriptionResult = {
  text: string;
  language: string | null;
  duration: number | null;
  segments: TranscriptionSegment[];
  words: TranscriptionWord[];
};

type AnalysisStatus =
  | "IDLE"
  | "TRANSCRIBING"
  | "TRANSCRIBED"
  | "FAILED";


type VisualPlanItem = {
  id: string;
  start: number;
  end: number;
  transcript: string;
  action: "BROLL" | "IMPACT_WORD";
  broll: {
    subject: string | null;
    intent: string | null;
    concepts: string[];
  };
  impactText: string | null;
  reason: string;
};

type VisualPlan = {
  summary: string;
  duration: number;
  items: VisualPlanItem[];
};

type VisualPlanStatus =
  | "IDLE"
  | "PLANNING"
  | "PLAN_READY"
  | "FAILED";

type RenderDiagnosticEntry = {
  id: string;
  stage: string;
  label: string;
  startedAt: number;
  durationMs: number | null;
  percent: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatElapsed(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "0:00.0";
  }

  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

function classifyRenderStage(message: string) {
  if (/Leyendo B-roll/i.test(message)) return "READ_ASSETS";
  if (/Inicializando/i.test(message)) return "INITIALIZE";
  if (/Renderizando segmento/i.test(message)) return "BROLL_SEGMENT";
  if (/timeline visual|Construyendo timeline/i.test(message)) return "VISUAL_TIMELINE";
  if (/subt[ií]tulos/i.test(message)) return "SUBTITLES";
  if (/Impact Words/i.test(message)) return "IMPACT_WORDS";
  if (/voice-over/i.test(message)) return "AUDIO";
  if (/Aplicando|MP4 final|Construyendo MP4/i.test(message)) return "FINAL_ENCODE";
  if (/Finalizando/i.test(message)) return "FINALIZE";
  if (/Render listo/i.test(message)) return "DONE";

  return "OTHER";
}

function renderStageName(stage: string) {
  switch (stage) {
    case "READ_ASSETS":
      return "Read local B-roll";
    case "INITIALIZE":
      return "Initialize FFmpeg";
    case "BROLL_SEGMENT":
      return "Encode B-roll";
    case "VISUAL_TIMELINE":
      return "Build visual timeline";
    case "SUBTITLES":
      return "Build subtitles";
    case "IMPACT_WORDS":
      return "Build Impact Words";
    case "AUDIO":
      return "Prepare voice-over";
    case "FINAL_ENCODE":
      return "Final encode";
    case "FINALIZE":
      return "Finalize MP4";
    case "DONE":
      return "Done";
    default:
      return "Other";
  }
}

function isSupportedAudio(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    file.type === "audio/mpeg" ||
    file.type === "audio/mp3" ||
    file.type === "audio/wav" ||
    file.type === "audio/x-wav" ||
    file.type === "audio/mp4" ||
    file.type === "audio/x-m4a" ||
    extension === "mp3" ||
    extension === "wav" ||
    extension === "m4a"
  );
}

export default function BrollEnginePage() {
  const router = useRouter();

  const {
    setPublishContext,
  } = useVideoSession();

  const inputRef = useRef<HTMLInputElement>(null);

  const {
    library,
    isConnecting,
    error: brollError,
    connectLibrary,
    disconnectLibrary,
  } = useBrollLibrary();

  const [audio, setAudio] = useState<AudioFileState | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [analysisStatus, setAnalysisStatus] =
    useState<AnalysisStatus>("IDLE");

  const [analysisError, setAnalysisError] =
    useState<string | null>(null);

  const [transcription, setTranscription] =
    useState<TranscriptionResult | null>(null);


  const [visualPlanStatus, setVisualPlanStatus] =
    useState<VisualPlanStatus>("IDLE");

  const [visualPlanError, setVisualPlanError] =
    useState<string | null>(null);

  const [visualPlan, setVisualPlan] =
    useState<VisualPlan | null>(null);


  const [
    selectedBrollByItem,
    setSelectedBrollByItem,
  ] = useState<Record<string, string | null>>({});


  const [
    renderPlan,
    setRenderPlan,
  ] = useState<BrollEngineRenderPlan | null>(null);

  const [
    renderPlanError,
    setRenderPlanError,
  ] = useState<string | null>(null);


  const [
    videoRenderStatus,
    setVideoRenderStatus,
  ] = useState<
    "IDLE" |
    "PREPARING" |
    "RENDERING" |
    "READY" |
    "FAILED"
  >("IDLE");

  const [
    videoRenderProgress,
    setVideoRenderProgress,
  ] = useState<VoiceOverRenderProgress>({
    percent: 0,
    phase: "INITIALIZING",
    message: "",
  });

  const [
    renderElapsedMs,
    setRenderElapsedMs,
  ] = useState(0);

  const [
    renderFinishedMs,
    setRenderFinishedMs,
  ] = useState<number | null>(null);

  const [
    renderDiagnostics,
    setRenderDiagnostics,
  ] = useState<RenderDiagnosticEntry[]>([]);

  const renderStartedAtRef =
    useRef<number | null>(null);

  const activeRenderDiagnosticRef =
    useRef<RenderDiagnosticEntry | null>(null);

  const [
    videoRenderError,
    setVideoRenderError,
  ] = useState<string | null>(null);

  const [
    renderedVideo,
    setRenderedVideo,
  ] = useState<File | null>(null);

  const [
    renderedVideoUrl,
    setRenderedVideoUrl,
  ] = useState<string | null>(null);


  const [
    isPlanReviewOpen,
    setIsPlanReviewOpen,
  ] = useState(false);

  const [
    planModalTab,
    setPlanModalTab,
  ] = useState<
    "REVIEW" | "RENDER"
  >("REVIEW");

  useEffect(() => {
    return () => {
      if (audio?.url) {
        URL.revokeObjectURL(audio.url);
      }
    };
  }, [audio]);

  function resetAnalysis() {
    setAnalysisStatus("IDLE");
    setAnalysisError(null);
    setTranscription(null);

    setVisualPlanStatus("IDLE");
    setVisualPlanError(null);
    setVisualPlan(null);
    setSelectedBrollByItem({});
    setRenderPlan(null);
    setRenderPlanError(null);
    setVideoRenderStatus("IDLE");
    setVideoRenderProgress({
      percent: 0,
      phase: "INITIALIZING",
      message: "",
    });
    setRenderElapsedMs(0);
    setRenderFinishedMs(null);
    setRenderDiagnostics([]);
    renderStartedAtRef.current = null;
    activeRenderDiagnosticRef.current = null;
    setVideoRenderError(null);
    setRenderedVideo(null);
    setRenderedVideoUrl(null);
  }

  function selectAudioFile(file?: File) {
    if (!file) {
      return;
    }

    if (!isSupportedAudio(file)) {
      setUploadError(
        "Por ahora B-Roll Engine acepta archivos MP3, WAV o M4A."
      );
      return;
    }

    if (audio?.url) {
      URL.revokeObjectURL(audio.url);
    }

    setUploadError(null);
    setDuration(null);
    resetAnalysis();

    setAudio({
      file,
      url: URL.createObjectURL(file),
    });
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    selectAudioFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectAudioFile(event.dataTransfer.files?.[0]);
  }

  function clearAudio() {
    if (audio?.url) {
      URL.revokeObjectURL(audio.url);
    }

    setAudio(null);
    setDuration(null);
    setUploadError(null);
    resetAnalysis();
  }

  async function analyzeAudio() {
    if (!audio) {
      return;
    }

    setAnalysisStatus("TRANSCRIBING");
    setAnalysisError(null);
    setTranscription(null);

    setVisualPlanStatus("IDLE");
    setVisualPlanError(null);
    setVisualPlan(null);

    try {
      const formData = new FormData();
      formData.append("audio", audio.file);

      const response = await fetch(
        "/api/broll-engine/transcribe",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo transcribir el audio."
        );
      }

      setTranscription({
        text: data.text ?? "",
        language: data.language ?? null,
        duration: data.duration ?? null,
        segments: Array.isArray(data.segments)
          ? data.segments
          : [],
        words: Array.isArray(data.words)
          ? data.words
          : [],
      });

      setAnalysisStatus("TRANSCRIBED");
    } catch (error) {
      console.error(
        "B-Roll Engine analyze audio error:",
        error
      );

      setAnalysisStatus("FAILED");

      setAnalysisError(
        error instanceof Error
          ? error.message
          : "No se pudo transcribir el audio."
      );
    }
  }

  async function generateVisualPlan() {
    if (!transcription) {
      return;
    }

    setVisualPlanStatus("PLANNING");
    setVisualPlanError(null);
    setVisualPlan(null);
    setSelectedBrollByItem({});
    setRenderPlan(null);
    setRenderPlanError(null);

    try {
      const response = await fetch(
        "/api/broll-engine/visual-plan",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            transcription: {
              text:
                transcription.text,

              language:
                transcription.language,

              duration:
                transcription.duration ??
                duration,

              segments:
                transcription.segments,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo generar el Visual Plan."
        );
      }

      setVisualPlan(
        data as VisualPlan
      );

      setVisualPlanStatus(
        "PLAN_READY"
      );
    } catch (error) {
      console.error(
        "B-Roll Engine visual plan error:",
        error
      );

      setVisualPlanStatus(
        "FAILED"
      );

      setVisualPlanError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el Visual Plan."
      );
    }
  }

  useEffect(() => {
    setRenderPlan(null);
    setRenderPlanError(null);

    setVideoRenderStatus("IDLE");
    setVideoRenderError(null);
    setRenderedVideo(null);

    setRenderedVideoUrl(
      (current) => {
        if (current) {
          URL.revokeObjectURL(
            current
          );
        }

        return null;
      }
    );
  }, [
    visualPlan,
    selectedBrollByItem,
  ]);

  useEffect(() => {
    return () => {
      if (
        renderedVideoUrl
      ) {
        URL.revokeObjectURL(
          renderedVideoUrl
        );
      }
    };
  }, [
    renderedVideoUrl,
  ]);

  function prepareRenderPlan() {
    if (
      !visualPlan ||
      !library ||
      !transcription
    ) {
      return;
    }

    try {
      const prepared =
        buildBrollEngineRenderPlan({
          visualPlan,

          selectedBrollByItem,

          catalog:
            library.catalog,

          words:
            transcription.words,
        });

      setRenderPlan(
        prepared
      );

      setRenderPlanError(
        null
      );
    } catch (error) {
      console.error(
        "B-Roll Engine render plan error:",
        error
      );

      setRenderPlan(null);

      setRenderPlanError(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la timeline de render."
      );
    }
  }

  function recordRenderProgress(
    update: VoiceOverRenderProgress
  ) {
    setVideoRenderProgress(update);

    const startedAt =
      renderStartedAtRef.current;

    if (startedAt === null) {
      return;
    }

    const now =
      performance.now();

    const label =
      update.message.trim() ||
      update.phase;

    const current =
      activeRenderDiagnosticRef.current;

    if (
      current &&
      current.label === label
    ) {
      return;
    }

    if (current) {
      const currentDuration =
        Math.max(
          0,
          now -
            current.startedAt
        );

      setRenderDiagnostics(
        (entries) =>
          entries.map(
            (entry) =>
              entry.id ===
              current.id
                ? {
                    ...entry,
                    durationMs:
                      currentDuration,
                  }
                : entry
          )
      );
    }

    const nextEntry: RenderDiagnosticEntry = {
      id:
        crypto.randomUUID(),
      stage:
        classifyRenderStage(
          label
        ),
      label,
      startedAt: now,
      durationMs: null,
      percent:
        update.percent,
    };

    activeRenderDiagnosticRef.current =
      nextEntry;

    setRenderDiagnostics(
      (entries) => [
        ...entries,
        nextEntry,
      ]
    );
  }

  function finishRenderDiagnostics() {
    const now =
      performance.now();

    const startedAt =
      renderStartedAtRef.current;

    if (startedAt !== null) {
      const total =
        Math.max(
          0,
          now -
            startedAt
        );

      setRenderElapsedMs(total);
      setRenderFinishedMs(total);
    }

    const current =
      activeRenderDiagnosticRef.current;

    if (current) {
      const currentDuration =
        Math.max(
          0,
          now -
            current.startedAt
        );

      setRenderDiagnostics(
        (entries) =>
          entries.map(
            (entry) =>
              entry.id ===
              current.id
                ? {
                    ...entry,
                    durationMs:
                      currentDuration,
                  }
                : entry
          )
      );
    }

    renderStartedAtRef.current =
      null;

    activeRenderDiagnosticRef.current =
      null;
  }

  async function renderBrollVideo() {
    if (
      !renderPlan ||
      !library ||
      !audio
    ) {
      return;
    }

    setVideoRenderStatus(
      "PREPARING"
    );

    setVideoRenderError(
      null
    );

    setRenderElapsedMs(0);
    setRenderFinishedMs(null);
    setRenderDiagnostics([]);
    activeRenderDiagnosticRef.current =
      null;
    renderStartedAtRef.current =
      performance.now();

    recordRenderProgress({
      percent: 1,
      phase: "PREPARING",
      message:
        "Preparando audio y B-roll...",
    });

    setRenderedVideo(
      null
    );

    setRenderedVideoUrl(
      (current) => {
        if (current) {
          URL.revokeObjectURL(
            current
          );
        }

        return null;
      }
    );

    try {
      const inputs = [];

      for (
        let index = 0;
        index <
        renderPlan.assets.length;
        index += 1
      ) {
        const asset =
          renderPlan.assets[
            index
          ];

        recordRenderProgress({
          percent:
            3 +
            Math.round(
              ((index + 1) /
                Math.max(
                  1,
                  renderPlan.assets.length
                )) *
                7
            ),
          phase:
            "PREPARING",
          message:
            `Leyendo B-roll ${index + 1}/${renderPlan.assets.length}...`,
        });

        const file =
          await getBrollFile(
            library.rootHandle,
            asset.path
          );

        inputs.push({
          assetId:
            asset.assetId,

          path:
            asset.path,

          file,
        });
      }

      setVideoRenderStatus(
        "RENDERING"
      );

      const result =
        await renderVoiceOverVideo(
          audio.file,
          inputs,
          {
            width: 1080,
            height: 1920,

            duration:
              renderPlan.duration,

            brollSegments:
              renderPlan.brollSegments,

            subtitleSegments:
              renderPlan.subtitleSegments,

            impactSegments:
              renderPlan.impactSegments,

            onProgress:
              recordRenderProgress,
          }
        );

      const previewUrl =
        URL.createObjectURL(
          result
        );

      setRenderedVideo(
        result
      );

      setRenderedVideoUrl(
        previewUrl
      );

      recordRenderProgress({
        percent: 100,
        phase: "DONE",
        message: "Render listo.",
      });

      finishRenderDiagnostics();

      setVideoRenderStatus(
        "READY"
      );
    } catch (error) {
      console.error(
        "B-Roll Engine render error:",
        error
      );

      finishRenderDiagnostics();

      setVideoRenderStatus(
        "FAILED"
      );

      setVideoRenderError(
        error instanceof Error
          ? error.message
          : "No se pudo renderizar el video."
      );
    }
  }

  useEffect(() => {
    if (
      videoRenderStatus !==
        "PREPARING" &&
      videoRenderStatus !==
        "RENDERING"
    ) {
      return;
    }

    const startedAt =
      renderStartedAtRef.current;

    if (startedAt === null) {
      return;
    }

    const updateElapsed = () => {
      setRenderElapsedMs(
        Math.max(
          0,
          performance.now() -
            startedAt
        )
      );
    };

    updateElapsed();

    const interval =
      window.setInterval(
        updateElapsed,
        250
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [videoRenderStatus]);

  useEffect(() => {
    if (
      visualPlanStatus ===
        "PLAN_READY" &&
      visualPlan
    ) {
      setPlanModalTab(
        "REVIEW"
      );
      setIsPlanReviewOpen(
        true
      );
    }
  }, [
    visualPlanStatus,
    visualPlan,
  ]);

  useEffect(() => {
    if (!isPlanReviewOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        setIsPlanReviewOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [isPlanReviewOpen]);

  const effectiveDuration =
    transcription?.duration ??
    duration ??
    0;


  function handleContinueToPublish() {
    if (
      !renderedVideo ||
      !transcription ||
      !visualPlan
    ) {
      return;
    }

    /*
      B-Roll Engine usa IMPACT_WORD como acción propia,
      mientras que el contrato compartido de Publish
      entiende KEY_STATEMENT.

      Para Publish ambos significan lo mismo:
      un momento editorial de énfasis.
    */
    const publishTranscription:
      SessionTranscription = {
        text:
          transcription.text,

        language:
          transcription.language,

        duration:
          transcription.duration ??
          effectiveDuration,

        segments:
          transcription.segments.map(
            (segment) => ({
              id:
                segment.id,

              start:
                segment.start,

              end:
                segment.end,

              text:
                segment.text,
            })
          ),

        words:
          transcription.words.map(
            (word) => ({
              word:
                word.word,

              start:
                word.start,

              end:
                word.end,
            })
          ),
      };

    const publishEditPlan:
      SessionEditPlan = {
        summary:
          visualPlan.summary,

        items:
          visualPlan.items.map(
            (item) => ({
              id:
                item.id,

              start:
                item.start,

              end:
                item.end,

              transcript:
                item.transcript,

              action:
                item.action ===
                "IMPACT_WORD"
                  ? "KEY_STATEMENT"
                  : "BROLL",

              effect:
                item.action ===
                "IMPACT_WORD"
                  ? "KEY_STATEMENT"
                  : "NONE",

              textOverlay:
                item.action ===
                "IMPACT_WORD"
                  ? item.impactText
                  : null,

              broll:
                item.broll,

              reason:
                item.reason,
            })
          ),
      };

    setPublishContext({
      renderedVideo,
      transcription:
        publishTranscription,
      editPlan:
        publishEditPlan,
    });

    router.push(
      "/publish"
    );
  }

  const resolvedBrollCount =
    visualPlan
      ? visualPlan.items.filter(
          (item) =>
            Boolean(
              selectedBrollByItem[
                item.id
              ]
            )
        ).length
      : 0;

  const renderTotalMs =
    renderFinishedMs ??
    renderElapsedMs;

  const renderRealtimeRatio =
    effectiveDuration > 0 &&
    renderTotalMs > 0
      ? renderTotalMs /
        1000 /
        effectiveDuration
      : null;

  const currentSegmentMatch =
    videoRenderProgress.message.match(
      /Renderizando segmento\s+(\d+)\/(\d+)/i
    );

  const currentSegmentLabel =
    currentSegmentMatch
      ? `${currentSegmentMatch[1]}/${currentSegmentMatch[2]}`
      : "—";

  const diagnosticStageTotals =
    renderDiagnostics.reduce<
      Record<string, number>
    >(
      (totals, entry) => {
        if (
          entry.durationMs ===
          null
        ) {
          return totals;
        }

        totals[entry.stage] =
          (totals[entry.stage] ??
            0) +
          entry.durationMs;

        return totals;
      },
      {}
    );

  const diagnosticStageRows =
    Object.entries(
      diagnosticStageTotals
    )
      .map(
        ([
          stage,
          milliseconds,
        ]) => ({
          stage,
          milliseconds,
        })
      )
      .sort(
        (a, b) =>
          b.milliseconds -
          a.milliseconds
      );

  return (
    <main className="min-h-screen px-5 py-5 text-white md:px-8 md:py-7">
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
        onChange={handleInput}
        className="hidden"
      />

      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            ← Volver
          </button>

          <div className="flex items-center gap-3">
            {library ? (
              <div className="flex items-center gap-2">
                <div className="hidden rounded-xl border border-lime-300/15 bg-lime-300/[0.05] px-3 py-2 sm:block">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-lime-300" />
                    <span className="text-xs font-semibold text-lime-200">
                      B-ROLL CONNECTED
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-500">
                    {library.catalog.totalAssets} assets · {library.rootHandle.name}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={disconnectLibrary}
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:border-red-300/20 hover:text-red-200"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectLibrary}
                disabled={isConnecting}
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect B-roll Library"}
              </button>
            )}

            <div className="text-xl font-black tracking-[-0.05em]">
              CUT<span className="text-lime-300">PILOT</span>
            </div>
          </div>
        </header>

        {brollError && (
          <div className="mb-6 rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
            {brollError}
          </div>
        )}

        {!audio ? (
          <>
            <section className="mb-8 max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/5 px-3 py-1 text-xs font-medium text-violet-200">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                B-ROLL ENGINE
              </div>

              <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
                Sube tu{" "}
                <span className="text-violet-300">voice-over final.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">
                CutPilot construye el video completo con B-roll local, subtítulos,
                Impact Words y render vertical.
              </p>
            </section>

            {uploadError && (
              <div className="mb-5 rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
                {uploadError}
              </div>
            )}

            <section
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`group cursor-pointer rounded-[2rem] border border-dashed p-5 transition md:p-8 ${
                dragging
                  ? "border-violet-300/70 bg-violet-300/[0.06]"
                  : "border-white/15 bg-white/[0.025] hover:border-violet-300/30 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[1.5rem] border border-white/[0.05] bg-black/10 px-6 text-center">
                <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] text-3xl text-violet-200 transition group-hover:scale-105">
                  ↑
                </div>

                <h2 className="text-2xl font-bold tracking-[-0.03em]">
                  Drop your voice-over
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Arrastra tu audio final aquí o haz clic para elegirlo.
                </p>

                <div className="mt-7 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-400">
                  MP3 · WAV · M4A · El archivo permanece local en tu navegador
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/5 px-3 py-1 text-xs font-medium text-violet-200">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                B-ROLL ENGINE
              </div>

              <h1 className="text-4xl font-black tracking-[-0.05em] md:text-6xl">
                {visualPlan
                  ? "Visual Plan listo."
                  : transcription
                    ? "Audio entendido."
                    : analysisStatus === "TRANSCRIBING"
                      ? "Escuchando tu voice-over."
                      : "Construye tu video."}
              </h1>

              <p className="mt-4 max-w-2xl text-slate-400">
                {visualPlan
                  ? "CutPilot ya decidió qué B-roll usar durante todo el audio y dónde aplicar Impact Words."
                  : transcription
                    ? "La transcripción está lista. Ahora genera el Visual Plan para construir la edición."
                    : analysisStatus === "TRANSCRIBING"
                      ? "CutPilot está transcribiendo el audio y obteniendo word timestamps."
                      : "Empieza analizando el audio final."}
              </p>
            </section>

            {(uploadError || analysisError || visualPlanError) && (
              <div className="mb-5 space-y-2">
                {uploadError && (
                  <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
                    {uploadError}
                  </div>
                )}

                {analysisError && (
                  <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
                    {analysisError}
                  </div>
                )}

                {visualPlanError && (
                  <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
                    {visualPlanError}
                  </div>
                )}
              </div>
            )}

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
              <div className="flex flex-col gap-4">
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-5 md:p-6">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300">
                          VOICE-OVER
                        </p>

                        <h2 className="mt-2 truncate text-xl font-black tracking-[-0.03em]">
                          {audio.file.name}
                        </h2>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          disabled={analysisStatus === "TRANSCRIBING"}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                        >
                          CHANGE
                        </button>

                        <button
                          type="button"
                          onClick={clearAudio}
                          disabled={analysisStatus === "TRANSCRIBING"}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-500 transition hover:border-red-300/20 hover:text-red-200 disabled:opacity-40"
                        >
                          REMOVE
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                      <audio
                        src={audio.url}
                        controls
                        preload="metadata"
                        onLoadedMetadata={(event) =>
                          setDuration(event.currentTarget.duration)
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {visualPlan && (
                  <div className="rounded-[2rem] border border-violet-300/15 bg-violet-300/[0.025] p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300">
                          VISUAL PLAN READY
                        </p>

                        <h2 className="mt-2 text-xl font-black tracking-[-0.03em]">
                          Decisiones editoriales
                        </h2>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                          {visualPlan.summary}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
                            {visualPlan.items.length} decisiones
                          </span>

                          <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-xs text-cyan-200">
                            {resolvedBrollCount}/{visualPlan.items.length} B-roll
                          </span>

                          <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-300/[0.04] px-2.5 py-1 text-xs text-fuchsia-200">
                            {visualPlan.items.filter((item) => item.action === "IMPACT_WORD").length} Impact
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPlanModalTab("REVIEW");
                          setIsPlanReviewOpen(true);
                        }}
                        className="shrink-0 rounded-2xl bg-violet-300 px-5 py-3 text-sm font-black text-black transition hover:bg-violet-200"
                      >
                        OPEN VISUAL PLAN
                      </button>
                    </div>
                  </div>
                )}

                {transcription && (
                  <details className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-300">
                      Ver transcripción
                    </summary>

                    <div className="mt-5 max-h-[420px] space-y-2 overflow-y-auto pr-2">
                      {transcription.segments.length > 0 ? (
                        transcription.segments.map((segment) => (
                          <div
                            key={`${segment.id}-${segment.start}`}
                            className="grid gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 sm:grid-cols-[90px_1fr]"
                          >
                            <div className="text-xs font-semibold text-cyan-200">
                              {formatTimestamp(segment.start)}
                              {" → "}
                              {formatTimestamp(segment.end)}
                            </div>

                            <p className="text-sm leading-6 text-slate-300">
                              {segment.text}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-6 text-slate-300">
                          {transcription.text}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>

              <aside className="flex flex-col gap-4">
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
                  <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">
                    AUDIO
                  </p>

                  <p className="mt-4 break-all text-sm font-medium text-slate-200">
                    {audio.file.name}
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs text-slate-500">DURACIÓN</p>
                      <p className="mt-2 text-lg font-bold text-white">
                        {formatDuration(effectiveDuration)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs text-slate-500">TAMAÑO</p>
                      <p className="mt-2 text-lg font-bold text-white">
                        {formatBytes(audio.file.size)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs text-slate-500">WORDS</p>
                      <p className="mt-2 text-lg font-bold text-white">
                        {transcription?.words.length ?? "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs text-slate-500">OUTPUT</p>
                      <p className="mt-2 text-lg font-bold text-white">
                        1080×1920
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-300">
                      Estado
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        visualPlan
                          ? "bg-violet-300/10 text-violet-200"
                          : visualPlanStatus === "PLANNING" ||
                              analysisStatus === "TRANSCRIBING"
                            ? "bg-cyan-300/10 text-cyan-200"
                            : transcription
                              ? "bg-lime-300/10 text-lime-200"
                              : analysisStatus === "FAILED" ||
                                  visualPlanStatus === "FAILED"
                                ? "bg-red-400/10 text-red-300"
                                : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {visualPlan
                        ? "VISUAL PLAN READY"
                        : visualPlanStatus === "PLANNING"
                          ? "PLANNING"
                          : transcription
                            ? "TRANSCRIBED"
                            : analysisStatus === "TRANSCRIBING"
                              ? "TRANSCRIBING"
                              : analysisStatus === "FAILED" ||
                                  visualPlanStatus === "FAILED"
                                ? "FAILED"
                                : "READY"}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {visualPlan
                      ? "El plan visual está listo para revisión y render."
                      : visualPlanStatus === "PLANNING"
                        ? "CutPilot está construyendo la narrativa visual."
                        : transcription
                          ? "La transcripción está lista para generar el Visual Plan."
                          : analysisStatus === "TRANSCRIBING"
                            ? "CutPilot está transcribiendo el voice-over."
                            : "Analiza el audio para comenzar."}
                  </p>

                  {!transcription ? (
                    <button
                      type="button"
                      onClick={analyzeAudio}
                      disabled={analysisStatus === "TRANSCRIBING"}
                      className={`mt-6 w-full rounded-2xl px-5 py-4 font-black transition ${
                        analysisStatus !== "TRANSCRIBING"
                          ? "bg-violet-300 text-black hover:bg-violet-200"
                          : "cursor-not-allowed bg-violet-300 text-black opacity-30"
                      }`}
                    >
                      {analysisStatus === "TRANSCRIBING"
                        ? "TRANSCRIBING..."
                        : analysisStatus === "FAILED"
                          ? "RETRY ANALYSIS"
                          : "ANALYZE AUDIO"}
                    </button>
                  ) : !visualPlan ? (
                    <button
                      type="button"
                      onClick={generateVisualPlan}
                      disabled={visualPlanStatus === "PLANNING"}
                      className={`mt-6 w-full rounded-2xl px-5 py-4 font-black transition ${
                        visualPlanStatus !== "PLANNING"
                          ? "bg-cyan-300 text-black hover:bg-cyan-200"
                          : "cursor-not-allowed bg-cyan-300 text-black opacity-30"
                      }`}
                    >
                      {visualPlanStatus === "PLANNING"
                        ? "BUILDING VISUAL PLAN..."
                        : visualPlanStatus === "FAILED"
                          ? "RETRY VISUAL PLAN"
                          : "GENERATE VISUAL PLAN"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPlanModalTab("REVIEW");
                        setIsPlanReviewOpen(true);
                      }}
                      className="mt-6 w-full rounded-2xl bg-violet-300 px-5 py-4 font-black text-black transition hover:bg-violet-200"
                    >
                      OPEN VISUAL PLAN
                    </button>
                  )}
                </div>
              </aside>
            </section>
          </>
        )}
      </div>

      {isPlanReviewOpen && visualPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6">
          <button
            type="button"
            aria-label="Cerrar Visual Plan"
            onClick={() => setIsPlanReviewOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="CutPilot B-Roll Visual Plan"
            className="relative z-10 h-[92vh] w-full max-w-6xl overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-[#0b1018] shadow-2xl shadow-black/60"
          >
            <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b1018]/95 px-4 py-4 backdrop-blur-xl md:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-violet-200">
                      VISUAL PLAN
                    </span>

                    <span className="text-[11px] text-slate-500">
                      {resolvedBrollCount}/{visualPlan.items.length} B-roll
                    </span>
                  </div>

                  <h2 className="mt-1 truncate text-xl font-black tracking-[-0.04em] md:text-2xl">
                    {planModalTab === "REVIEW"
                      ? "B-roll Review"
                      : "Render"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPlanReviewOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-lg text-slate-400 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-1.5">
                <button
                  type="button"
                  onClick={() => setPlanModalTab("REVIEW")}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
                    planModalTab === "REVIEW"
                      ? "bg-white/[0.08] text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  REVIEW B-ROLL
                </button>

                <button
                  type="button"
                  onClick={() => setPlanModalTab("RENDER")}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
                    planModalTab === "RENDER"
                      ? "bg-violet-300 text-black"
                      : "text-violet-200 hover:bg-violet-300/[0.06]"
                  }`}
                >
                  RENDER VIDEO
                </button>
              </div>
            </header>

            <div className="relative z-0 px-4 py-4 md:px-6 md:py-5">
              {planModalTab === "REVIEW" ? (
                <div className="mx-auto max-w-4xl">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
                      {visualPlan.items.length} CLIPS
                    </span>

                    <span className="rounded-full border border-lime-300/15 bg-lime-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-lime-200">
                      {resolvedBrollCount} RESOLVED
                    </span>

                    <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-fuchsia-200">
                      {visualPlan.items.filter((item) => item.action === "IMPACT_WORD").length} IMPACT
                    </span>

                    <details className="ml-auto">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-300">
                        Ver resumen
                      </summary>

                      <div className="mt-2 max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs leading-5 text-slate-400">
                        {visualPlan.summary}
                      </div>
                    </details>
                  </div>

                  <div className="space-y-4">
                    {visualPlan.items.map((item, index) => (
                      <section
                        key={item.id}
                        className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20"
                      >
                        <div className="flex flex-col gap-2 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
                                {formatTimestamp(item.start)} → {formatTimestamp(item.end)}
                              </span>

                              <span
                                className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                                  item.action === "IMPACT_WORD"
                                    ? "bg-fuchsia-300/10 text-fuchsia-200"
                                    : "bg-violet-300/10 text-violet-200"
                                }`}
                              >
                                {item.action}
                              </span>

                              <span className="text-[10px] font-semibold text-slate-600">
                                #{String(index + 1).padStart(2, "0")}
                              </span>
                            </div>

                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">
                              “{item.transcript}”
                            </p>

                            {item.action === "IMPACT_WORD" && item.impactText && (
                              <p className="mt-2 text-[11px] font-semibold text-fuchsia-200/80">
                                Impact: {item.impactText}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="p-3 md:p-4">
                          {library ? (
                            <BrollEngineMatchList
                              catalog={library.catalog}
                              request={item.broll}
                              selectedAssetId={
                                selectedBrollByItem[item.id] ?? null
                              }
                              onSelect={(assetId) =>
                                setSelectedBrollByItem((current) => ({
                                  ...current,
                                  [item.id]: assetId,
                                }))
                              }
                            />
                          ) : (
                            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-3 text-xs text-amber-100/70">
                              Conecta tu biblioteca para resolver este B-roll.
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-4xl">
                  <section className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.025] p-4 md:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.16em] text-violet-300">
                          READY TO RENDER
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {visualPlan.items.length} B-roll · subtitles ·{" "}
                          {visualPlan.items.filter((item) => item.action === "IMPACT_WORD").length} Impact Words · MP4
                        </p>
                      </div>

                      {!renderPlan ? (
                        <button
                          type="button"
                          onClick={prepareRenderPlan}
                          disabled={
                            !library ||
                            resolvedBrollCount !== visualPlan.items.length
                          }
                          className={`rounded-xl px-5 py-3 text-sm font-black transition ${
                            library &&
                            resolvedBrollCount === visualPlan.items.length
                              ? "bg-cyan-300 text-black hover:bg-cyan-200"
                              : "cursor-not-allowed bg-cyan-300/10 text-cyan-200/50"
                          }`}
                        >
                          {resolvedBrollCount === visualPlan.items.length
                            ? "PREPARE RENDER"
                            : `RESOLVE ${visualPlan.items.length - resolvedBrollCount} CLIPS`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={renderBrollVideo}
                          disabled={
                            videoRenderStatus === "PREPARING" ||
                            videoRenderStatus === "RENDERING"
                          }
                          className={`rounded-xl px-5 py-3 text-sm font-black transition ${
                            videoRenderStatus === "PREPARING" ||
                            videoRenderStatus === "RENDERING"
                              ? "cursor-not-allowed bg-violet-300/10 text-violet-200/50"
                              : "bg-violet-300 text-black hover:bg-violet-200"
                          }`}
                        >
                          {videoRenderStatus === "PREPARING"
                            ? "PREPARING..."
                            : videoRenderStatus === "RENDERING"
                              ? `RENDERING ${videoRenderProgress.percent}%`
                              : videoRenderStatus === "READY"
                                ? "RENDER AGAIN"
                                : "RENDER VIDEO"}
                        </button>
                      )}
                    </div>

                    {(videoRenderStatus === "PREPARING" ||
                      videoRenderStatus === "RENDERING" ||
                      videoRenderStatus === "READY" ||
                      videoRenderStatus === "FAILED") && (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.025] p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-cyan-300">
                              {(videoRenderStatus === "PREPARING" ||
                                videoRenderStatus === "RENDERING") && (
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                              )}
                              RENDER DIAGNOSTICS
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-300">
                              {videoRenderProgress.message || "Esperando render..."}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-end gap-5">
                            <div className="text-right">
                              <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                                ELAPSED
                              </p>
                              <p className="mt-1 font-mono text-2xl font-black tracking-[-0.05em] text-white">
                                {formatElapsed(renderTotalMs)}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                                PROGRESS
                              </p>
                              <p className="mt-1 text-2xl font-black tracking-[-0.05em] text-white">
                                {videoRenderProgress.percent}
                                <span className="ml-0.5 text-xs text-slate-500">%</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.45)] transition-[width] duration-300 ease-out"
                            style={{
                              width: `${videoRenderProgress.percent}%`,
                            }}
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                              VIDEO
                            </p>
                            <p className="mt-1 text-sm font-black text-white">
                              {formatDuration(effectiveDuration)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                              SPEED
                            </p>
                            <p className="mt-1 text-sm font-black text-white">
                              {renderRealtimeRatio
                                ? `${renderRealtimeRatio.toFixed(2)}× realtime`
                                : "—"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                              SEGMENT
                            </p>
                            <p className="mt-1 text-sm font-black text-white">
                              {currentSegmentLabel}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                            <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-600">
                              PHASE
                            </p>
                            <p className="mt-1 truncate text-sm font-black text-white">
                              {renderStageName(
                                classifyRenderStage(
                                  videoRenderProgress.message
                                )
                              )}
                            </p>
                          </div>
                        </div>

                        <details
                          open={
                            videoRenderStatus === "READY" ||
                            videoRenderStatus === "FAILED"
                          }
                          className="mt-3 rounded-xl border border-white/[0.06] bg-black/20"
                        >
                          <summary className="cursor-pointer list-none px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-bold tracking-[0.12em] text-slate-400">
                                  TIMING BREAKDOWN
                                </p>
                                <p className="mt-1 text-[10px] text-slate-600">
                                  Identifica qué etapa está consumiendo el tiempo.
                                </p>
                              </div>

                              <span className="text-[10px] text-slate-600">
                                {renderDiagnostics.length} events
                              </span>
                            </div>
                          </summary>

                          <div className="border-t border-white/[0.05] p-3">
                            {diagnosticStageRows.length > 0 ? (
                              <div className="space-y-2">
                                {diagnosticStageRows.map((row) => {
                                  const share =
                                    renderTotalMs > 0
                                      ? (row.milliseconds / renderTotalMs) * 100
                                      : 0;

                                  return (
                                    <div
                                      key={row.stage}
                                      className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-slate-300">
                                          {renderStageName(row.stage)}
                                        </span>

                                        <span className="font-mono text-xs text-cyan-200">
                                          {formatElapsed(row.milliseconds)}
                                        </span>
                                      </div>

                                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                                        <div
                                          className="h-full rounded-full bg-cyan-300/70"
                                          style={{
                                            width: `${Math.max(1, Math.min(100, share))}%`,
                                          }}
                                        />
                                      </div>

                                      <p className="mt-1 text-right text-[9px] text-slate-600">
                                        {share.toFixed(1)}%
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600">
                                Los tiempos aparecerán cuando comience el render.
                              </p>
                            )}

                            {renderDiagnostics.length > 0 && (
                              <details className="mt-3">
                                <summary className="cursor-pointer text-[10px] font-semibold text-slate-500 hover:text-slate-300">
                                  Ver eventos individuales
                                </summary>

                                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
                                  {renderDiagnostics.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="grid grid-cols-[1fr_auto] gap-3 rounded-lg px-2 py-1.5 text-[10px]"
                                    >
                                      <span className="truncate text-slate-500">
                                        {entry.label}
                                      </span>

                                      <span className="font-mono text-slate-300">
                                        {entry.durationMs === null
                                          ? "running…"
                                          : formatElapsed(entry.durationMs)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </details>
                      </div>
                    )}

                    {renderPlanError && (
                      <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-4 text-xs leading-5 text-red-200">
                        {renderPlanError}
                      </div>
                    )}

                    {videoRenderError && (
                      <div className="mt-4 max-h-44 overflow-y-auto rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-4 text-xs leading-5 text-red-200">
                        {videoRenderError}
                      </div>
                    )}

                    {renderPlan && (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[10px] text-slate-500">B-ROLL</p>
                          <p className="mt-2 text-lg font-black text-white">
                            {renderPlan.brollSegments.length}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[10px] text-slate-500">ASSETS</p>
                          <p className="mt-2 text-lg font-black text-white">
                            {renderPlan.assets.length}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[10px] text-slate-500">SUBTITLES</p>
                          <p className="mt-2 text-lg font-black text-white">
                            {renderPlan.subtitleSegments.length}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[10px] text-slate-500">IMPACT</p>
                          <p className="mt-2 text-lg font-black text-white">
                            {renderPlan.impactSegments.length}
                          </p>
                        </div>
                      </div>
                    )}
                  </section>

                  {renderPlan && (
                    <details
                      open={!renderedVideoUrl}
                      className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.025]"
                    >
                      <summary className="cursor-pointer list-none px-4 py-3 md:px-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold tracking-[0.16em] text-cyan-200">
                              SUBTITLES PREVIEW
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {renderPlan.subtitleSegments.length} bloques generados
                            </p>
                          </div>

                          <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
                            WORD TIMESTAMPS
                          </span>
                        </div>
                      </summary>

                      <div className="border-t border-white/[0.06]">
                        <div className="max-h-[300px] overflow-y-auto p-3">
                          <div className="space-y-1.5">
                            {renderPlan.subtitleSegments.map((cue, index) => (
                              <div
                                key={`${cue.start}-${cue.end}-${index}`}
                                className="grid gap-2 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 sm:grid-cols-[110px_1fr] sm:items-center"
                              >
                                <span className="text-[10px] font-semibold text-cyan-200">
                                  {cue.start.toFixed(2)} → {cue.end.toFixed(2)}
                                </span>

                                <span className="text-sm font-semibold text-slate-200">
                                  {cue.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  )}

                  {renderedVideoUrl && renderedVideo ? (
                    <section className="relative z-0 isolate mx-auto mt-4 w-full max-w-[360px] overflow-hidden rounded-2xl border border-lime-300/15 bg-[#05070b] [contain:paint]">
                      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                        <p className="text-[10px] font-bold tracking-[0.14em] text-lime-200">
                          RENDERED PREVIEW
                        </p>

                        <span className="text-[10px] text-slate-600">MP4</span>
                      </div>

                      <div className="flex justify-center bg-black/70 p-2 sm:p-3">
                        <video
                          key={renderedVideoUrl}
                          src={renderedVideoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="relative z-0 block max-h-[50vh] w-auto max-w-full rounded-xl bg-black object-contain [backface-visibility:hidden] [transform:translateZ(0)]"
                        />
                      </div>
                    </section>
                  ) : (
                    <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 text-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-400">
                          El preview final aparecerá aquí.
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          Primero prepara la timeline y ejecuta RENDER VIDEO.
                        </p>
                      </div>
                    </div>
                  )}

                  {renderPlan && (
                    <details className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-300">
                        Ver Render Plan
                      </summary>

                      <div className="space-y-2 border-t border-white/[0.06] p-3">
                        {visualPlan.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-1 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                          >
                            <span className="shrink-0 text-[10px] font-semibold text-cyan-200">
                              {formatTimestamp(item.start)} → {formatTimestamp(item.end)}
                            </span>

                            <span
                              className={`shrink-0 text-[10px] font-semibold ${
                                item.action === "IMPACT_WORD"
                                  ? "text-fuchsia-200"
                                  : "text-violet-200"
                              }`}
                            >
                              {item.action}
                            </span>

                            <span className="truncate text-[11px] text-slate-500">
                              {library?.catalog.assets.find(
                                (asset) =>
                                  asset.id === selectedBrollByItem[item.id]
                              )?.filename ?? "No asset"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {planModalTab === "RENDER" &&
              renderedVideoUrl &&
              renderedVideo && (
                <footer className="sticky bottom-0 z-30 border-t border-white/[0.07] bg-[#0b1018]/95 px-4 py-3 backdrop-blur-xl md:px-6">
                  <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold tracking-[0.14em] text-lime-200">
                        RENDER READY
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        MP4 listo · {formatBytes(renderedVideo.size)} · listo para Publish + Mobile
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={renderedVideoUrl}
                        download={renderedVideo.name}
                        className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs font-black tracking-[0.03em] text-slate-300 transition hover:border-white/20 hover:text-white"
                      >
                        DOWNLOAD MP4
                      </a>

                      <button
                        type="button"
                        onClick={handleContinueToPublish}
                        className="rounded-xl bg-lime-300 px-5 py-3 text-sm font-black tracking-[0.03em] text-slate-950 transition hover:bg-lime-200"
                      >
                        CONTINUE TO PUBLISH
                      </button>
                    </div>
                  </div>
                </footer>
              )}
          </section>
        </div>
      )}
    </main>
  );
}
