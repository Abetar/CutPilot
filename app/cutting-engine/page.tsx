"use client";

import {
  ChangeEvent,
  DragEvent,
  SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { extractAudioFromVideo } from "@/lib/extractAudio";
import {
  analyzeAudioActivity,
  type AudioActivityAnalysis,
} from "@/lib/cutting/analyzeAudioActivity";
import {
  renderCutVideo,
  type CutRenderSegment,
} from "@/lib/cutting/renderCutVideo";
import {
  runRetakeSecondPass,
  type RetakeSecondPassResult,
} from "@/lib/cutting/transcribeRetakeCandidates";
import {
  runBoundarySecondPass,
  type BoundarySecondPassResult,
} from "@/lib/cutting/transcribeBoundaryCandidates";
import {
  resolveSafeBoundaries,
  type SafeBoundaryReport,
} from "@/lib/cutting/resolveSafeBoundaries";

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscriptWord = {
  word: string;
  start: number;
  end: number;
};

type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
};

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

type AnalyzeStatus =
  | "IDLE"
  | "EXTRACTING_AUDIO"
  | "ANALYZING_AUDIO"
  | "TRANSCRIBING"
  | "READY"
  | "FAILED";

type CutDecision =
  | "KEEP"
  | "REMOVE"
  | "REVIEW";

type CutPlanItem = {
  id: string;
  start: number;
  end: number;
  text: string;
  decision: CutDecision;
  confidence: number;
  reason: string;
};

type CutPlan = {
  summary: string;
  originalDuration: number;
  estimatedDuration: number;
  items: CutPlanItem[];
};

type CutPlanStatus =
  | "IDLE"
  | "GENERATING"
  | "READY"
  | "FAILED";

type CutPlanFilter =
  | "ALL"
  | "KEEP"
  | "REMOVE"
  | "REVIEW";

type CutRenderStatus =
  | "IDLE"
  | "RENDERING"
  | "READY"
  | "FAILED";

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(milliseconds / 1000)
    );

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function roundDebugNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sumItemDuration(
  items: CutPlanItem[]
) {
  return roundDebugNumber(
    items.reduce(
      (total, item) =>
        total +
        Math.max(
          0,
          item.end -
            item.start
        ),
      0
    )
  );
}

function isAudioCutItem(item: CutPlanItem) {
  return (
    item.reason.includes("Audio Activity Cutter") ||
    item.text.startsWith("Silencio de audio")
  );
}

function findPlanOverlaps(
  items: CutPlanItem[]
) {
  const sorted =
    [...items].sort(
      (a, b) =>
        a.start -
        b.start ||
        a.end -
        b.end
    );

  const overlaps: Array<{
    firstId: string;
    firstDecision: CutDecision;
    secondId: string;
    secondDecision: CutDecision;
    overlapStart: number;
    overlapEnd: number;
    overlapDuration: number;
  }> = [];

  for (
    let index = 0;
    index <
      sorted.length;
    index += 1
  ) {
    const current =
      sorted[index];

    for (
      let nextIndex =
        index + 1;
      nextIndex <
        sorted.length;
      nextIndex += 1
    ) {
      const next =
        sorted[nextIndex];

      if (
        next.start >=
        current.end
      ) {
        break;
      }

      const overlapStart =
        Math.max(
          current.start,
          next.start
        );

      const overlapEnd =
        Math.min(
          current.end,
          next.end
        );

      if (
        overlapEnd >
        overlapStart
      ) {
        overlaps.push({
          firstId:
            current.id,

          firstDecision:
            current.decision,

          secondId:
            next.id,

          secondDecision:
            next.decision,

          overlapStart:
            roundDebugNumber(
              overlapStart
            ),

          overlapEnd:
            roundDebugNumber(
              overlapEnd
            ),

          overlapDuration:
            roundDebugNumber(
              overlapEnd -
                overlapStart
            ),
        });
      }
    }
  }

  return overlaps;
}

function findTimelineGaps(
  items: CutPlanItem[],
  duration: number
) {
  const ranges =
    [...items]
      .filter(
        (item) =>
          Number.isFinite(
            item.start
          ) &&
          Number.isFinite(
            item.end
          ) &&
          item.end >
            item.start
      )
      .map(
        (item) => ({
          start:
            Math.max(
              0,
              item.start
            ),

          end:
            Math.min(
              duration,
              item.end
            ),
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  const merged: Array<{
    start: number;
    end: number;
  }> = [];

  for (
    const range of
      ranges
  ) {
    const previous =
      merged[
        merged.length - 1
      ];

    if (
      previous &&
      range.start <=
        previous.end
    ) {
      previous.end =
        Math.max(
          previous.end,
          range.end
        );

      continue;
    }

    merged.push({
      ...range,
    });
  }

  const gaps: Array<{
    start: number;
    end: number;
    duration: number;
  }> = [];

  let cursor =
    0;

  for (
    const range of
      merged
  ) {
    if (
      range.start >
      cursor
    ) {
      gaps.push({
        start:
          roundDebugNumber(
            cursor
          ),

        end:
          roundDebugNumber(
            range.start
          ),

        duration:
          roundDebugNumber(
            range.start -
              cursor
          ),
      });
    }

    cursor =
      Math.max(
        cursor,
        range.end
      );
  }

  if (
    duration >
    cursor
  ) {
    gaps.push({
      start:
        roundDebugNumber(
          cursor
        ),

      end:
        roundDebugNumber(
          duration
        ),

      duration:
        roundDebugNumber(
          duration -
            cursor
        ),
    });
  }

  return gaps;
}

export default function CuttingEnginePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const previewStopRef = useRef<number | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<AnalyzeStatus>("IDLE");
  const [transcription, setTranscription] = useState<Transcription | null>(null);

  const [audioActivity, setAudioActivity] =
    useState<AudioActivityAnalysis | null>(null);

  const [analysisAudioFile, setAnalysisAudioFile] =
    useState<File | null>(null);

  const [retakeSecondPass, setRetakeSecondPass] =
    useState<RetakeSecondPassResult | null>(null);

  const [retakeSecondPassProgress, setRetakeSecondPassProgress] =
    useState<{
      completed: number;
      total: number;
    } | null>(null);

  const [boundarySecondPass, setBoundarySecondPass] =
    useState<BoundarySecondPassResult | null>(null);

  const [boundarySecondPassProgress, setBoundarySecondPassProgress] =
    useState<{
      completed: number;
      total: number;
    } | null>(null);

  const [boundarySecondPassError, setBoundarySecondPassError] =
    useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [transcriptExpanded, setTranscriptExpanded] =
    useState(false);

  const [cutPlanFilter, setCutPlanFilter] =
    useState<CutPlanFilter>("ALL");

  const [cutPlanStatus, setCutPlanStatus] =
    useState<CutPlanStatus>("IDLE");

  const [cutPlan, setCutPlan] =
    useState<CutPlan | null>(null);

  const [baselineCutPlan, setBaselineCutPlan] =
    useState<CutPlan | null>(null);

  const [safeBoundaryReport, setSafeBoundaryReport] =
    useState<SafeBoundaryReport | null>(null);

  const [showAudioCuts, setShowAudioCuts] =
    useState(false);

  const [previewingItemId, setPreviewingItemId] =
    useState<string | null>(null);

  const [cutPlanError, setCutPlanError] =
    useState<string | null>(null);

  const [cutRenderStatus, setCutRenderStatus] =
    useState<CutRenderStatus>("IDLE");

  const [cutRenderProgress, setCutRenderProgress] =
    useState(0);

  const [cutRenderElapsedMs, setCutRenderElapsedMs] =
    useState(0);

  const [cutRenderStartedAt, setCutRenderStartedAt] =
    useState<number | null>(null);

  const [cutRenderError, setCutRenderError] =
    useState<string | null>(null);

  const [cutVideoFile, setCutVideoFile] =
    useState<File | null>(null);

  const [cutVideoUrl, setCutVideoUrl] =
    useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (cutVideoUrl) URL.revokeObjectURL(cutVideoUrl);
    };
  }, [cutVideoUrl]);

  useEffect(() => {
    if (
      cutRenderStatus !== "RENDERING" ||
      cutRenderStartedAt === null
    ) {
      return;
    }

    const updateElapsed = () => {
      setCutRenderElapsedMs(
        Date.now() - cutRenderStartedAt
      );
    };

    updateElapsed();

    const interval = window.setInterval(
      updateElapsed,
      250
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [
    cutRenderStatus,
    cutRenderStartedAt,
  ]);

  const isAnalyzing =
    status === "EXTRACTING_AUDIO" ||
    status === "ANALYZING_AUDIO" ||
    status === "TRANSCRIBING";

  const statusCopy = useMemo(() => {
    switch (status) {
      case "EXTRACTING_AUDIO":
        return "Extrayendo audio localmente...";
      case "ANALYZING_AUDIO":
        return "Detectando actividad de voz y tiempo muerto...";
      case "TRANSCRIBING":
        return "Transcribiendo video crudo...";
      case "READY":
        return "Transcripción lista.";
      case "FAILED":
        return "No se pudo analizar el video.";
      default:
        return null;
    }
  }, [status]);

  function resetAnalysis() {
    setMetadata(null);
    setTranscription(null);
    setAudioActivity(null);
    setAnalysisAudioFile(null);
    setRetakeSecondPass(null);
    setRetakeSecondPassProgress(null);
    setBoundarySecondPass(null);
    setBoundarySecondPassProgress(null);
    setBoundarySecondPassError(null);
    setTranscriptExpanded(false);
    setCutPlanFilter("ALL");
    setStatus("IDLE");
    setError(null);
    setCutPlanStatus("IDLE");
    setCutPlan(null);
    setBaselineCutPlan(null);
    setSafeBoundaryReport(null);
    setShowAudioCuts(false);
    setPreviewingItemId(null);
    previewStopRef.current = null;
    setCutPlanError(null);
    setCutRenderStatus("IDLE");
    setCutRenderProgress(0);
    setCutRenderElapsedMs(0);
    setCutRenderStartedAt(null);
    setCutRenderError(null);
    setCutVideoFile(null);

    if (cutVideoUrl) {
      URL.revokeObjectURL(cutVideoUrl);
      setCutVideoUrl(null);
    }
  }

  function selectFile(file?: File) {
    if (!file) return;

    const isMp4 =
      file.type === "video/mp4" ||
      file.name.toLowerCase().endsWith(".mp4");

    if (!isMp4) {
      setError("Por ahora Cutting Engine acepta únicamente archivos MP4.");
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    resetAnalysis();
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function updateCutDecision(
    itemId: string,
    decision: CutDecision
  ) {
    if (cutVideoUrl) {
      URL.revokeObjectURL(cutVideoUrl);
      setCutVideoUrl(null);
    }

    setCutVideoFile(null);
    setBoundarySecondPass(null);
    setBoundarySecondPassProgress(null);
    setBoundarySecondPassError(null);
    setCutRenderStatus("IDLE");
    setCutRenderProgress(0);
    setCutRenderElapsedMs(0);
    setCutRenderStartedAt(null);
    setCutRenderError(null);

    setCutPlan((current) => {
      if (!current) return current;

      const items = current.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              decision,
            }
          : item
      );

      const estimatedDuration = items.reduce(
        (total, item) =>
          item.decision === "REMOVE"
            ? total
            : total + Math.max(0, item.end - item.start),
        0
      );

      return {
        ...current,
        items,
        estimatedDuration,
      };
    });
  }

  async function handleGenerateCutPlan() {
    if (
      !transcription ||
      !audioActivity ||
      cutPlanStatus === "GENERATING"
    ) {
      return;
    }

    setCutPlanStatus("GENERATING");
    setCutPlanError(null);
    setCutPlan(null);
    setBaselineCutPlan(null);
    setSafeBoundaryReport(null);
    setRetakeSecondPassProgress(null);
    setBoundarySecondPass(null);
    setBoundarySecondPassProgress(null);
    setBoundarySecondPassError(null);

    try {
      /*
        ==========================================
        RETAKE SECOND PASS V2 — TAKE SELECTOR INPUT
        ==========================================

        Antes de modificar decisiones del Cut Plan
        queremos comprobar que una retranscripción
        localizada sí logra ver los retakes que el
        transcript global colapsó.

        Importante:
        - Se envía al Take Selector como evidencia local.
        - NO cambia Audio Activity.
        - NO cambia renderer.
        - Ayuda a reconstruir retakes que el transcript
          global colapsó o temporizó mal.
      */
      let secondPass =
        retakeSecondPass;

      if (
        analysisAudioFile &&
        !secondPass
      ) {
        secondPass =
          await runRetakeSecondPass(
            analysisAudioFile,
            transcription,
            audioActivity,
            (
              completed,
              total
            ) => {
              setRetakeSecondPassProgress({
                completed,
                total,
              });
            }
          );

        setRetakeSecondPass(
          secondPass
        );
      }

      setRetakeSecondPassProgress(
        null
      );

      const response = await fetch(
        "/api/cutting-engine/cut-plan",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcription,
            audioActivity,
            retakeSecondPass:
              secondPass,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "No se pudo generar el Cut Plan."
        );
      }

      if (
        typeof data.summary !== "string" ||
        !Array.isArray(data.items)
      ) {
        throw new Error(
          "Cutting Engine devolvió un Cut Plan inválido."
        );
      }

      const plan = data as CutPlan;
      setBaselineCutPlan(plan);

      /*
        ==========================================
        SAFE BOUNDARY PIPELINE
        ==========================================

        1. El route decide QUÉ tomas conservar.
        2. Boundary Second Pass retranscribe solo fronteras
           sospechosas y aplica Reliability Gate.
        3. Safe Boundary Resolver tiene la última palabra
           sobre los cortes acústicos dentro de KEEP.

        Audio Activity es una PROPUESTA de corte. Una palabra
        localmente confirmada dentro de un KEEP queda protegida.
      */
      if (!analysisAudioFile) {
        throw new Error(
          "No está disponible el audio de análisis para validar fronteras."
        );
      }

      try {
        const boundaryPass =
          await runBoundarySecondPass(
            analysisAudioFile,
            transcription,
            plan,
            secondPass,
            (completed, total) => {
              setBoundarySecondPassProgress({
                completed,
                total,
              });
            }
          );

        setBoundarySecondPass(boundaryPass);

        const safeResolution =
          resolveSafeBoundaries(
            plan,
            boundaryPass,
            transcription
          );

        setSafeBoundaryReport(
          safeResolution.report
        );
        setCutPlan(safeResolution.plan);
      } catch (boundaryError) {
        const message =
          boundaryError instanceof Error
            ? boundaryError.message
            : "No se pudo validar las fronteras del Cut Plan.";

        setBoundarySecondPassError(message);
        throw new Error(
          `Safe Boundary Resolver no pudo validar el montaje: ${message}`
        );
      } finally {
        setBoundarySecondPassProgress(null);
      }

      setCutPlanStatus("READY");
    } catch (caughtError) {
      setCutPlanStatus("FAILED");
      setCutPlanError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ocurrió un error generando el Cut Plan."
      );
    }
  }

  function handlePreviewItem(item: CutPlanItem) {
    const video = sourceVideoRef.current;

    if (!video) {
      return;
    }

    const previewStart = Math.max(0, item.start - 0.08);
    const previewEnd = Math.max(previewStart + 0.05, item.end + 0.08);

    previewStopRef.current = previewEnd;
    setPreviewingItemId(item.id);
    video.currentTime = previewStart;

    void video.play().catch(() => {
      setPreviewingItemId(null);
      previewStopRef.current = null;
    });
  }

  function handleSourceTimeUpdate(
    event: SyntheticEvent<HTMLVideoElement>
  ) {
    const stopAt = previewStopRef.current;

    if (stopAt === null) {
      return;
    }

    if (event.currentTarget.currentTime >= stopAt) {
      event.currentTarget.pause();
      previewStopRef.current = null;
      setPreviewingItemId(null);
    }
  }

  async function handleRenderCut() {
    if (
      !videoFile ||
      !cutPlan ||
      cutRenderStatus === "RENDERING"
    ) {
      return;
    }

    const unresolvedReviews =
      cutPlan.items.filter(
        (item) => item.decision === "REVIEW"
      );

    if (unresolvedReviews.length > 0) {
      setCutRenderError(
        `Resuelve los ${unresolvedReviews.length} bloque(s) REVIEW antes de cortar.`
      );

      return;
    }

    const keepSegments: CutRenderSegment[] =
      cutPlan.items
        .filter(
          (item) => item.decision === "KEEP"
        )
        .map((item) => ({
          start: item.start,
          end: item.end,
        }));

    if (keepSegments.length === 0) {
      setCutRenderError(
        "El Cut Plan no contiene ningún segmento KEEP."
      );

      return;
    }

    const renderStartedAt =
      Date.now();

    setCutRenderStartedAt(renderStartedAt);
    setCutRenderElapsedMs(0);
    setCutRenderStatus("RENDERING");
    setCutRenderProgress(1);
    setCutRenderError(null);

    if (cutVideoUrl) {
      URL.revokeObjectURL(cutVideoUrl);
      setCutVideoUrl(null);
    }

    setCutVideoFile(null);

    try {
      const result =
        await renderCutVideo(
          videoFile,
          keepSegments,
          (progress) => {
            setCutRenderProgress(progress);
          }
        );

      const url =
        URL.createObjectURL(result);

      setCutVideoFile(result);
      setCutVideoUrl(url);
      setCutRenderElapsedMs(
        Date.now() - renderStartedAt
      );
      setCutRenderStartedAt(null);
      setCutRenderProgress(100);
      setCutRenderStatus("READY");
    } catch (caughtError) {
      setCutRenderElapsedMs(
        Date.now() - renderStartedAt
      );
      setCutRenderStartedAt(null);
      setCutRenderStatus("FAILED");
      setCutRenderError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo generar el video cortado."
      );
    }
  }

  function handleDownloadDiagnostics() {
    if (
      !videoFile ||
      !transcription ||
      !audioActivity ||
      !cutPlan
    ) {
      return;
    }

    const keepItems =
      cutPlan.items.filter(
        (item) =>
          item.decision ===
          "KEEP"
      );

    const removeItems =
      cutPlan.items.filter(
        (item) =>
          item.decision ===
          "REMOVE"
      );

    const reviewItems =
      cutPlan.items.filter(
        (item) =>
          item.decision ===
          "REVIEW"
      );

    const audioRemoveItems =
      removeItems.filter(
        isAudioCutItem
      );

    const aiRemoveItems =
      removeItems.filter(
        (item) =>
          !audioRemoveItems.some(
            (audioItem) =>
              audioItem.id ===
              item.id
          )
      );

    const rendererKeepSegments =
      keepItems.map(
        (item) => ({
          id:
            item.id,

          start:
            roundDebugNumber(
              item.start
            ),

          end:
            roundDebugNumber(
              item.end
            ),

          duration:
            roundDebugNumber(
              Math.max(
                0,
                item.end -
                  item.start
              )
            ),

          text:
            item.text,
        })
      );

    const wordGaps =
      transcription.words
        .slice(
          0,
          -1
        )
        .map(
          (
            word,
            index
          ) => {
            const next =
              transcription.words[
                index + 1
              ];

            return {
              afterWord:
                word.word,

              beforeWord:
                next.word,

              from:
                roundDebugNumber(
                  word.end
                ),

              to:
                roundDebugNumber(
                  next.start
                ),

              duration:
                roundDebugNumber(
                  Math.max(
                    0,
                    next.start -
                      word.end
                  )
                ),
            };
          }
        )
        .filter(
          (gap) =>
            gap.duration >
            0
        );

    const planDuration =
      Number.isFinite(
        cutPlan.originalDuration
      )
        ? cutPlan.originalDuration
        : metadata?.duration ??
          transcription.duration ??
          0;

    const debugPayload = {
      schema:
        "cutpilot-cutting-debug-v3",

      exportedAt:
        new Date().toISOString(),

      sourceVideo: {
        name:
          videoFile.name,

        type:
          videoFile.type,

        sizeBytes:
          videoFile.size,

        sizeMB:
          roundDebugNumber(
            videoFile.size /
              (1024 * 1024)
          ),

        metadata,
      },

      pipelineState: {
        analyzeStatus:
          status,

        cutPlanStatus,

        cutRenderStatus,

        cutRenderProgress:
          roundDebugNumber(
            cutRenderProgress
          ),

        cutRenderElapsedMs,

        cutRenderError,

        renderedVideo:
          cutVideoFile
            ? {
                name:
                  cutVideoFile.name,

                type:
                  cutVideoFile.type,

                sizeBytes:
                  cutVideoFile.size,
              }
            : null,
      },

      transcription: {
        language:
          transcription.language,

        duration:
          transcription.duration,

        text:
          transcription.text,

        segmentCount:
          transcription.segments.length,

        wordCount:
          transcription.words.length,

        segments:
          transcription.segments,

        words:
          transcription.words,

        wordGaps,
      },

      audioActivity,

      retakeSecondPass,

      boundarySecondPass,

      safeBoundaryReport,

      baselineCutPlan,

      cutPlan: {
        summary:
          cutPlan.summary,

        originalDuration:
          cutPlan.originalDuration,

        estimatedDuration:
          cutPlan.estimatedDuration,

        itemCount:
          cutPlan.items.length,

        counts: {
          keep:
            keepItems.length,

          remove:
            removeItems.length,

          review:
            reviewItems.length,

          audioActivityRemove:
            audioRemoveItems.length,

          aiRemove:
            aiRemoveItems.length,
        },

        durations: {
          keepSeconds:
            sumItemDuration(
              keepItems
            ),

          removeSeconds:
            sumItemDuration(
              removeItems
            ),

          reviewSeconds:
            sumItemDuration(
              reviewItems
            ),

          audioActivityRemoveSeconds:
            sumItemDuration(
              audioRemoveItems
            ),

          aiRemoveSeconds:
            sumItemDuration(
              aiRemoveItems
            ),
        },

        overlaps:
          findPlanOverlaps(
            cutPlan.items
          ),

        uncoveredTimelineGaps:
          findTimelineGaps(
            cutPlan.items,
            planDuration
          ),

        rendererKeepSegments,

        items:
          cutPlan.items,
      },

      diagnosticNotes: {
        purpose:
          "Archivo para analizar diferencias entre detección de audio, Cut Plan y renderer.",

        important:
          [
            "rendererKeepSegments contiene exactamente los KEEP que la página enviaría a renderCutVideo.",
            "overlaps permite detectar KEEP/REMOVE superpuestos.",
            "uncoveredTimelineGaps muestra zonas que no están representadas por ningún item del Cut Plan.",
            "wordGaps sirve para comparar timestamps de Whisper contra silencios reales.",
            "audioActivity contiene los silencios y take boundaries detectados directamente en el audio.",
            "retakeSecondPass contiene retranscripciones locales de ventanas sospechosas y ahora alimenta al Take Selector para reparar retakes colapsados por el transcript global.",
            "boundarySecondPass valida localmente fronteras sospechosas y marca cada evidencia como RELIABLE o REJECTED.",
            "safeBoundaryReport documenta qué habla localmente confirmada fue protegida frente a cortes de Audio Activity.",
            "baselineCutPlan es la salida editorial previa a Safe Boundary Resolver; cutPlan es el montaje final que se enviará al renderer.",
          ],
      },

      browser: {
        userAgent:
          typeof navigator !==
          "undefined"
            ? navigator.userAgent
            : null,
      },
    };

    const json =
      JSON.stringify(
        debugPayload,
        null,
        2
      );

    const blob =
      new Blob(
        [json],
        {
          type:
            "application/json",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const safeBase =
      videoFile.name
        .replace(
          /\.[^/.]+$/,
          ""
        )
        .replace(
          /[^a-zA-Z0-9-_]+/g,
          "-"
        )
        .replace(
          /-+/g,
          "-"
        )
        .replace(
          /^-|-$/g,
          ""
        ) ||
      "cutpilot";

    const timestamp =
      new Date()
        .toISOString()
        .replace(
          /[:.]/g,
          "-"
        );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      `${safeBase}-cutting-debug-${timestamp}.json`;

    document.body.appendChild(
      anchor
    );

    anchor.click();
    anchor.remove();

    window.setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1000
    );
  }

  function handleDownloadCut() {
    if (!cutVideoFile || !cutVideoUrl) {
      return;
    }

    const anchor =
      document.createElement("a");

    anchor.href = cutVideoUrl;
    anchor.download = cutVideoFile.name;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function handleAnalyze() {
    if (!videoFile || isAnalyzing) return;

    setError(null);
    setTranscription(null);
    setAudioActivity(null);
    setAnalysisAudioFile(null);
    setRetakeSecondPass(null);
    setRetakeSecondPassProgress(null);
    setBoundarySecondPass(null);
    setBoundarySecondPassProgress(null);
    setBoundarySecondPassError(null);
    setTranscriptExpanded(false);
    setCutPlanFilter("ALL");
    setCutPlanStatus("IDLE");
    setCutPlan(null);
    setBaselineCutPlan(null);
    setSafeBoundaryReport(null);
    setShowAudioCuts(false);
    setPreviewingItemId(null);
    previewStopRef.current = null;
    setCutPlanError(null);
    setCutRenderStatus("IDLE");
    setCutRenderProgress(0);
    setCutRenderElapsedMs(0);
    setCutRenderStartedAt(null);
    setCutRenderError(null);
    setCutVideoFile(null);

    if (cutVideoUrl) {
      URL.revokeObjectURL(cutVideoUrl);
      setCutVideoUrl(null);
    }

    try {
      setStatus("EXTRACTING_AUDIO");

      const audioFile = await extractAudioFromVideo(videoFile);

      setAnalysisAudioFile(
        audioFile
      );

      setStatus("ANALYZING_AUDIO");

      const activity =
        await analyzeAudioActivity(
          audioFile
        );

      setAudioActivity(
        activity
      );

      console.log(
        "CutPilot Audio Activity ready:",
        activity
      );

      const formData = new FormData();
      formData.append("audio", audioFile);

      setStatus("TRANSCRIBING");

      const response = await fetch("/api/auto-edit/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo transcribir el video.");
      }

      const result: Transcription = {
        text: typeof data.text === "string" ? data.text : "",
        language: typeof data.language === "string" ? data.language : null,
        duration: typeof data.duration === "number" ? data.duration : null,
        segments: Array.isArray(data.segments)
          ? data.segments.map((segment: Partial<TranscriptSegment>) => ({
              id: typeof segment.id === "number" ? segment.id : 0,
              start: typeof segment.start === "number" ? segment.start : 0,
              end: typeof segment.end === "number" ? segment.end : 0,
              text: typeof segment.text === "string" ? segment.text : "",
            }))
          : [],
        words: Array.isArray(data.words)
          ? data.words.map((word: Partial<TranscriptWord>) => ({
              word: typeof word.word === "string" ? word.word : "",
              start: typeof word.start === "number" ? word.start : 0,
              end: typeof word.end === "number" ? word.end : 0,
            }))
          : [],
      };

      setTranscription(result);
      setTranscriptExpanded(false);
      setStatus("READY");
    } catch (caughtError) {
      setStatus("FAILED");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ocurrió un error analizando el video."
      );
    }
  }

  const planStats = useMemo(() => {
    if (!cutPlan) {
      return null;
    }

    const keep = cutPlan.items.filter(
      (item) => item.decision === "KEEP"
    ).length;
    const remove = cutPlan.items.filter(
      (item) => item.decision === "REMOVE"
    ).length;
    const review = cutPlan.items.filter(
      (item) => item.decision === "REVIEW"
    ).length;
    const audioCuts = cutPlan.items.filter(
      isAudioCutItem
    ).length;
    const removedSeconds = Math.max(
      0,
      cutPlan.originalDuration - cutPlan.estimatedDuration
    );
    const reductionPercent =
      cutPlan.originalDuration > 0
        ? Math.round(
            (removedSeconds / cutPlan.originalDuration) * 100
          )
        : 0;

    return {
      keep,
      remove,
      review,
      audioCuts,
      removedSeconds,
      reductionPercent,
    };
  }, [cutPlan]);

  const visibleCutPlanItems = useMemo(() => {
    if (!cutPlan) {
      return [];
    }

    return cutPlan.items.filter((item) => {
      if (
        cutPlanFilter !== "ALL" &&
        item.decision !== cutPlanFilter
      ) {
        return false;
      }

      if (!showAudioCuts && isAudioCutItem(item)) {
        return false;
      }

      return true;
    });
  }, [cutPlan, cutPlanFilter, showAudioCuts]);

  const buildStatusDetail = retakeSecondPassProgress
    ? `Revisando retakes ${retakeSecondPassProgress.completed}/${retakeSecondPassProgress.total}`
    : boundarySecondPassProgress
      ? `Validando fronteras ${boundarySecondPassProgress.completed}/${boundarySecondPassProgress.total}`
      : cutPlanStatus === "GENERATING"
        ? "Seleccionando tomas y protegiendo habla..."
        : null;

  const canRender = Boolean(
    cutPlan &&
      planStats &&
      planStats.review === 0 &&
      cutRenderStatus !== "RENDERING"
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.055),transparent_34rem)] px-4 py-4 md:px-7 md:py-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-2 text-sm font-semibold text-slate-400 transition hover:border-white/20 hover:bg-white/[0.045] hover:text-white"
          >
            ← Inicio
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-3 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-200 sm:inline-flex">
              CUTTING ENGINE
            </span>
            <div className="text-lg font-black tracking-[-0.05em]">
              CUT<span className="text-lime-300">PILOT</span>
            </div>
          </div>
        </header>

        {!videoFile || !videoUrl ? (
          <section
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={handleDrop}
            className={`relative overflow-hidden rounded-[2rem] border border-dashed px-6 py-16 text-center transition md:py-24 ${
              dragging
                ? "border-cyan-300/60 bg-cyan-300/[0.07]"
                : "border-white/15 bg-white/[0.025]"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.07),transparent_45%)]" />
            <div className="relative mx-auto max-w-xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] text-2xl text-cyan-100">
                ✂
              </div>

              <p className="mt-7 text-xs font-black tracking-[0.18em] text-cyan-300">
                RAW → CLEAN CUT
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] md:text-6xl">
                Quita errores. Conserva la frase.
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-slate-400 md:text-base">
                Sube tu grabación cruda. CutPilot selecciona la mejor toma, elimina
                tiempo muerto y valida localmente cada frontera sospechosa antes de
                permitir que Audio Activity corte dentro de una frase.
              </p>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-8 rounded-xl bg-cyan-300 px-6 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
              >
                Seleccionar MP4
              </button>
              <p className="mt-3 text-xs text-slate-600">
                También puedes arrastrar el archivo aquí · procesamiento de video local
              </p>

              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,.mp4"
                onChange={handleInput}
                className="hidden"
              />

              {error && (
                <div className="mx-auto mt-6 max-w-md rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,.82fr)]">
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.025] lg:sticky lg:top-5">
                <div className="relative bg-black">
                  <video
                    ref={sourceVideoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    onTimeUpdate={handleSourceTimeUpdate}
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      setMetadata({
                        duration: video.duration,
                        width: video.videoWidth,
                        height: video.videoHeight,
                      });
                    }}
                    className="mx-auto max-h-[67vh] w-full object-contain"
                  />

                  {previewingItemId && (
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-cyan-300/25 bg-slate-950/85 px-3 py-1.5 text-[10px] font-black tracking-[0.1em] text-cyan-200 backdrop-blur">
                      PREVIEWING SEGMENT
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">
                      {videoFile.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatBytes(videoFile.size)}
                      {metadata
                        ? ` · ${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height}`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isAnalyzing || cutPlanStatus === "GENERATING"}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cambiar video
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/mp4,.mp4"
                    onChange={handleInput}
                    className="hidden"
                  />
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black tracking-[0.16em] text-slate-500">
                        WORKFLOW
                      </p>
                      <h1 className="mt-1 text-2xl font-black tracking-[-0.04em]">
                        Clean Cut
                      </h1>
                    </div>
                    <span className="rounded-full border border-lime-300/15 bg-lime-300/[0.05] px-2.5 py-1 text-[10px] font-black text-lime-200">
                      SAFE BOUNDARIES
                    </span>
                  </div>

                  <div className="mt-5 space-y-2">
                    {[
                      {
                        number: "01",
                        label: "Analizar",
                        done: status === "READY",
                        active: isAnalyzing,
                        copy: "Audio + transcripción",
                      },
                      {
                        number: "02",
                        label: "Elegir tomas",
                        done: cutPlanStatus === "READY",
                        active: cutPlanStatus === "GENERATING",
                        copy: "Retakes + Take Selector",
                      },
                      {
                        number: "03",
                        label: "Proteger fronteras",
                        done: Boolean(safeBoundaryReport),
                        active: Boolean(boundarySecondPassProgress),
                        copy: "Local timing + Reliability Gate",
                      },
                      {
                        number: "04",
                        label: "Render",
                        done: cutRenderStatus === "READY",
                        active: cutRenderStatus === "RENDERING",
                        copy: "MP4 final",
                      },
                    ].map((step) => (
                      <div
                        key={step.number}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                          step.done
                            ? "border-lime-300/15 bg-lime-300/[0.035]"
                            : step.active
                              ? "border-cyan-300/20 bg-cyan-300/[0.045]"
                              : "border-white/[0.07] bg-black/10"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                            step.done
                              ? "bg-lime-300/10 text-lime-200"
                              : step.active
                                ? "bg-cyan-300/10 text-cyan-200"
                                : "bg-white/[0.04] text-slate-600"
                          }`}
                        >
                          {step.done ? "✓" : step.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-200">{step.label}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{step.copy}</p>
                        </div>
                        {step.active && (
                          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                        )}
                      </div>
                    ))}
                  </div>

                  {!transcription ? (
                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isAnalyzing ? "ANALYZANDO..." : "ANALIZAR VIDEO"}
                    </button>
                  ) : !cutPlan ? (
                    <button
                      type="button"
                      onClick={handleGenerateCutPlan}
                      disabled={cutPlanStatus === "GENERATING"}
                      className="mt-5 w-full rounded-xl bg-lime-300 px-4 py-3.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-50"
                    >
                      {cutPlanStatus === "GENERATING"
                        ? "CONSTRUYENDO SAFE CUT..."
                        : "CREAR SAFE CUT PLAN"}
                    </button>
                  ) : (
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById("cut-plan")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                        }
                        className="rounded-xl bg-lime-300 px-3 py-3 text-xs font-black text-slate-950 transition hover:bg-lime-200"
                      >
                        REVISAR PLAN
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateCutPlan}
                        disabled={cutPlanStatus === "GENERATING"}
                        className="rounded-xl border border-white/10 px-3 py-3 text-xs font-black text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                      >
                        REGENERAR
                      </button>
                    </div>
                  )}

                  {(statusCopy || buildStatusDetail) && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            status === "FAILED" || cutPlanStatus === "FAILED"
                              ? "bg-rose-300"
                              : isAnalyzing || cutPlanStatus === "GENERATING"
                                ? "animate-pulse bg-cyan-300"
                                : "bg-lime-300"
                          }`}
                        />
                        <p className="text-xs font-semibold text-slate-300">
                          {buildStatusDetail ?? statusCopy}
                        </p>
                      </div>
                    </div>
                  )}

                  {(error || cutPlanError || boundarySecondPassError) && (
                    <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2.5 text-xs leading-5 text-rose-200">
                      {cutPlanError ?? boundarySecondPassError ?? error}
                    </div>
                  )}
                </div>

                {transcription && (
                  <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setTranscriptExpanded((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.025]"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-300">Detalles del análisis</p>
                        <p className="mt-1 text-[11px] text-slate-600">
                          {transcription.words.length} palabras
                          {retakeSecondPass
                            ? ` · ${retakeSecondPass.transcribedCount} retake windows`
                            : ""}
                          {boundarySecondPass
                            ? ` · ${boundarySecondPass.reliableCount}/${boundarySecondPass.transcribedCount} boundaries fiables`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`text-lg text-slate-600 transition-transform ${
                          transcriptExpanded ? "rotate-180" : ""
                        }`}
                      >
                        ⌄
                      </span>
                    </button>

                    {transcriptExpanded && (
                      <div className="border-t border-white/10 px-4 py-4">
                        <p className="max-h-44 overflow-y-auto pr-2 text-sm leading-6 text-slate-400">
                          {transcription.text}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
                          {retakeSecondPass && (
                            <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-cyan-200">
                              {retakeSecondPass.transcribedCount} RETAKE WINDOWS
                            </span>
                          )}
                          {boundarySecondPass && (
                            <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.04] px-2.5 py-1 text-violet-200">
                              {boundarySecondPass.reliableCount} RELIABLE BOUNDARIES
                            </span>
                          )}
                          {safeBoundaryReport && (
                            <span className="rounded-full border border-lime-300/15 bg-lime-300/[0.04] px-2.5 py-1 text-lime-200">
                              {safeBoundaryReport.restoredSegments} SAFE RESTORES
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </section>

            {cutPlan && planStats && (
              <section
                id="cut-plan"
                className="mt-7 scroll-mt-5 rounded-[2rem] border border-white/10 bg-white/[0.025] p-4 md:p-6"
              >
                <div className="flex flex-col gap-5 border-b border-white/10 pb-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-lime-300/20 bg-lime-300/[0.06] px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-lime-200">
                        SAFE CUT PLAN READY
                      </span>
                      {safeBoundaryReport && (
                        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] font-black text-cyan-200">
                          {safeBoundaryReport.reliableCandidates} boundaries verified
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-3xl font-black tracking-[-0.045em]">
                      Revisa contenido, no ruido técnico.
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Los silencios rutinarios están ocultos por defecto. Usa Preview para escuchar
                      cualquier bloque directamente en el video fuente antes de cambiar su decisión.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadDiagnostics}
                    className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black tracking-[0.08em] text-slate-500 transition hover:border-cyan-300/20 hover:text-cyan-200"
                  >
                    DEBUG JSON
                  </button>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                    <p className="text-[10px] font-black tracking-[0.12em] text-slate-600">ORIGINAL</p>
                    <p className="mt-1 font-mono text-2xl font-black text-slate-200">
                      {formatDuration(cutPlan.originalDuration)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-lime-300/15 bg-lime-300/[0.035] p-4">
                    <p className="text-[10px] font-black tracking-[0.12em] text-lime-300/70">FINAL EST.</p>
                    <p className="mt-1 font-mono text-2xl font-black text-lime-200">
                      {formatDuration(cutPlan.estimatedDuration)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
                    <p className="text-[10px] font-black tracking-[0.12em] text-cyan-300/70">REMOVED</p>
                    <p className="mt-1 font-mono text-2xl font-black text-cyan-100">
                      {planStats.reductionPercent}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                    <p className="text-[10px] font-black tracking-[0.12em] text-slate-600">REVIEW</p>
                    <p className={`mt-1 font-mono text-2xl font-black ${planStats.review ? "text-amber-200" : "text-slate-200"}`}>
                      {planStats.review}
                    </p>
                  </div>
                </div>

                {safeBoundaryReport && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-lime-300/15 bg-lime-300/[0.025] px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime-300/10 text-lime-200">✓</span>
                      <div>
                        <p className="text-sm font-bold text-slate-200">Semantic KEEP Protection aplicada</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {safeBoundaryReport.protectedWords} palabra(s) protegidas · {safeBoundaryReport.restoredSegments} restore(s) · +{safeBoundaryReport.restoredSeconds.toFixed(2)} s de habla recuperada
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black tracking-[0.1em] text-lime-300/70">
                      AUDIO ACTIVITY = PROPOSAL
                    </span>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(["ALL", "KEEP", "REMOVE", "REVIEW"] as CutPlanFilter[]).map(
                      (filter) => {
                        const count =
                          filter === "ALL"
                            ? cutPlan.items.length
                            : cutPlan.items.filter((item) => item.decision === filter).length;

                        return (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setCutPlanFilter(filter)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-black tracking-[0.07em] transition ${
                              cutPlanFilter === filter
                                ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                                : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                            }`}
                          >
                            {filter} · {count}
                          </button>
                        );
                      }
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAudioCuts((current) => !current)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black tracking-[0.06em] transition ${
                      showAudioCuts
                        ? "border-violet-300/25 bg-violet-300/[0.07] text-violet-200"
                        : "border-white/10 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {showAudioCuts ? "HIDE" : "SHOW"} AUDIO GAPS · {planStats.audioCuts}
                  </button>
                </div>

                <div className="mt-3 max-h-[620px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/10 p-2">
                  <div className="space-y-2">
                    {visibleCutPlanItems.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-600">
                        No hay bloques para este filtro.
                      </div>
                    ) : (
                      visibleCutPlanItems.map((item) => {
                        const isAudioSilence = isAudioCutItem(item);
                        const decisionClasses =
                          item.decision === "KEEP"
                            ? "border-lime-300/15 bg-lime-300/[0.022]"
                            : item.decision === "REMOVE"
                              ? "border-rose-300/15 bg-rose-300/[0.022]"
                              : "border-amber-300/15 bg-amber-300/[0.022]";
                        const badgeClasses =
                          item.decision === "KEEP"
                            ? "bg-lime-300/10 text-lime-200"
                            : item.decision === "REMOVE"
                              ? "bg-rose-300/10 text-rose-200"
                              : "bg-amber-300/10 text-amber-200";

                        if (isAudioSilence) {
                          return (
                            <article
                              key={item.id}
                              className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${decisionClasses}`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[9px] font-black text-slate-600">
                                  GAP
                                </span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  {formatDuration(item.start)}–{formatDuration(item.end)}
                                </span>
                                <span className="truncate text-xs text-slate-500">{item.text}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePreviewItem(item)}
                                className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-black text-slate-500 transition hover:text-white"
                              >
                                ▶ PREVIEW
                              </button>
                            </article>
                          );
                        }

                        return (
                          <article
                            key={item.id}
                            className={`rounded-2xl border p-4 ${decisionClasses}`}
                          >
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black tracking-[0.08em] ${badgeClasses}`}>
                                    {item.decision}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {formatDuration(item.start)}–{formatDuration(item.end)}
                                  </span>
                                  <span className="text-[10px] text-slate-600">
                                    {Math.max(0, item.end - item.start).toFixed(2)}s · {Math.round(item.confidence * 100)}%
                                  </span>
                                  {item.reason.startsWith("Safe Boundary Resolver") && (
                                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-0.5 text-[9px] font-black text-cyan-200">
                                      SAFE RESTORE
                                    </span>
                                  )}
                                </div>

                                <p className="mt-3 text-[15px] font-medium leading-6 text-slate-100">
                                  “{item.text}”
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-500">
                                  {item.reason}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePreviewItem(item)}
                                  className={`rounded-lg border px-3 py-2 text-[10px] font-black transition ${
                                    previewingItemId === item.id
                                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                                      : "border-white/10 text-slate-400 hover:border-cyan-300/20 hover:text-cyan-200"
                                  }`}
                                >
                                  {previewingItemId === item.id ? "PLAYING..." : "▶ PREVIEW"}
                                </button>

                                <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
                                  {(["KEEP", "REMOVE", "REVIEW"] as CutDecision[]).map((decision) => (
                                    <button
                                      key={decision}
                                      type="button"
                                      onClick={() => updateCutDecision(item.id, decision)}
                                      className={`rounded-md px-2.5 py-1.5 text-[9px] font-black tracking-[0.04em] transition ${
                                        item.decision === decision
                                          ? "bg-white/10 text-white"
                                          : "text-slate-600 hover:text-slate-300"
                                      }`}
                                    >
                                      {decision}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.025] p-4 md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-200">
                        {planStats.review > 0
                          ? `${planStats.review} bloque(s) necesitan tu decisión`
                          : "Plan resuelto y listo para render"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {planStats.review > 0
                          ? "Convierte cada REVIEW a KEEP o REMOVE."
                          : `${planStats.keep} KEEP · ${planStats.remove} REMOVE · estimado ${formatDuration(cutPlan.estimatedDuration)}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRenderCut}
                      disabled={!canRender}
                      className="min-w-[220px] rounded-xl bg-cyan-300 px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cutRenderStatus === "RENDERING"
                        ? `CUTTING ${Math.round(cutRenderProgress)}%`
                        : "GENERAR MP4 CORTADO"}
                    </button>
                  </div>

                  {cutRenderStatus === "RENDERING" && (
                    <div className="mt-5">
                      <div className="mb-2 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-[9px] font-black tracking-[0.12em] text-slate-600">ELAPSED</p>
                          <p className="mt-1 font-mono text-xl font-black text-cyan-200">
                            {formatElapsedTime(cutRenderElapsedMs)}
                          </p>
                        </div>
                        <p className="font-mono text-xl font-black text-white">
                          {Math.round(cutRenderProgress)}%
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-cyan-300 transition-[width] duration-300"
                          style={{
                            width: `${Math.max(2, Math.min(100, cutRenderProgress))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {cutRenderError && (
                    <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2.5 text-sm text-rose-200">
                      {cutRenderError}
                    </div>
                  )}
                </div>

                {cutVideoUrl && cutVideoFile && (
                  <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-lime-300/15 bg-lime-300/[0.025]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 md:px-5">
                      <div>
                        <p className="text-xs font-black tracking-[0.14em] text-lime-300">
                          CUT VIDEO READY
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatBytes(cutVideoFile.size)} · render {formatElapsedTime(cutRenderElapsedMs)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadCut}
                        className="rounded-xl bg-lime-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-lime-200"
                      >
                        DESCARGAR MP4
                      </button>
                    </div>
                    <div className="bg-black">
                      <video
                        src={cutVideoUrl}
                        controls
                        playsInline
                        className="mx-auto max-h-[72vh] w-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
