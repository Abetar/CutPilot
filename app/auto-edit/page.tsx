"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useVideoSession } from "@/components/VideoSessionProvider";
import { useBrollLibrary } from "@/components/BrollLibraryProvider";
import { BrollMatchList } from "@/components/BrollMatchList";
import { matchBroll } from "@/lib/broll/matchBroll";
import { getBrollFile } from "@/lib/broll/localLibrary";
import { buildSubtitles } from "@/lib/subtitles/buildSubtitles";
import {
  prepareRenderWorkspace,
  renderVideoFromWorkspace,
  type RenderBrollInput,
  type RenderBrollSegment,
  type RenderEffectSegment,
  type RenderImpactSegment,
  type RenderSubtitleSegment,
} from "@/lib/renderVideo";

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  orientation: "Vertical" | "Horizontal" | "Square";
};

type ValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
};

type FinalRenderReviewState =
  | "NOT_APPLICABLE"
  | "AUTO"
  | "PENDING"
  | "KEEP"
  | "REMOVE";

type FinalRenderPlan = {
  summary: string;
  items: Array<{
    id: string;
    start: number;
    end: number;
    transcript: string;
    sourceAction: string;
    resolvedAction: string;
    effect: string;
    textOverlay: string | null;
    reviewDecision: FinalRenderReviewState;
    selectedBroll: {
      assetId: string;
      filename: string;
      path: string;
      orientation: string;
      source: string;
    } | null;
  }>;
};

type RenderWorkspaceStatus =
  | "IDLE"
  | "PREPARING"
  | "READY"
  | "FAILED";

type VideoRenderStatus =
  | "IDLE"
  | "PREPARING"
  | "RENDERING"
  | "READY"
  | "FAILED";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export default function AutoEditPage() {
  const router = useRouter();

  const {
    video,
    autoEditStatus,
    transcription,
    editPlan,
    brollReviews,
    autoEditError,
    startAutoEdit,
    setRenderedVideo,
  } = useVideoSession();

  const { library } = useBrollLibrary();

  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);

  const [editPlanTab, setEditPlanTab] =
    useState<"REVIEW" | "RENDER">("REVIEW");

  const [renderWorkspaceStatus, setRenderWorkspaceStatus] =
    useState<RenderWorkspaceStatus>("IDLE");

  const [renderWorkspaceMessage, setRenderWorkspaceMessage] =
    useState<string | null>(null);

  const [videoRenderStatus, setVideoRenderStatus] =
    useState<VideoRenderStatus>("IDLE");

  const [videoRenderMessage, setVideoRenderMessage] =
    useState<string | null>(null);

  const [renderedVideoUrl, setRenderedVideoUrl] =
    useState<string | null>(null);

  /*
    Efecto opcional de alto impacto.

    Solo se aplica a momentos KEY_STATEMENT.
    Dentro de esos momentos:
    - overlay oscuro
    - palabra actual al centro
    - brillo
    - click de cámara
    - subtítulos normales deshabilitados
  */
  const [impactWordsEnabled, setImpactWordsEnabled] =
    useState(false);

  useEffect(() => {
    if (!video) {
      router.replace("/");
    }
  }, [video, router]);

  const validation = useMemo<ValidationResult>(() => {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!video || !metadata) {
      return {
        valid: false,
        warnings,
        errors,
      };
    }

    if (video.file.size <= 0) {
      errors.push("El archivo está vacío.");
    }

    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      errors.push("No se pudo determinar una duración válida.");
    }

    if (metadata.width <= 0 || metadata.height <= 0) {
      errors.push("No se pudo leer correctamente la resolución.");
    }

    if (metadata.orientation !== "Vertical") {
      warnings.push(
        "El video no es vertical. CutPilot está optimizado principalmente para contenido 9:16.",
      );
    }

    if (metadata.duration > 180) {
      warnings.push(
        "El video supera los 3 minutos. Auto Edit está pensado principalmente para videos cortos.",
      );
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }, [video, metadata]);

  const isAnalyzing = autoEditStatus === "ANALYZING";

  const editPlanReady =
    autoEditStatus === "EDIT_PLAN_READY" && Boolean(editPlan);

  const failed = autoEditStatus === "FAILED";

  const brollCount =
    editPlan?.items.filter((item) => item.action === "BROLL").length ?? 0;

  const subtitleCues = useMemo(() => {
    if (!transcription?.words?.length) {
      return [];
    }

    return buildSubtitles(
      transcription.words
    );
  }, [transcription]);

  /*
    ========================================
    FINAL RENDER PLAN
    ========================================

    Resuelve el Edit Plan editorial contra
    las decisiones reales del B-roll review.

    - Sin review explícito: usa BEST automático.
    - KEEP: usa el asset confirmado.
    - PENDING: conserva el replacement elegido,
      pero sigue marcado como pendiente.
    - REMOVE: convierte ese bloque a TALKING_HEAD.
  */
  const finalRenderPlan = useMemo<FinalRenderPlan | null>(() => {
    if (!editPlan || !library) {
      return null;
    }

    return {
      summary: editPlan.summary,

      items: editPlan.items.map((item) => {
        if (item.action !== "BROLL" || !item.broll) {
          return {
            id: item.id,
            start: item.start,
            end: item.end,
            transcript: item.transcript,
            sourceAction: item.action,
            resolvedAction: item.action,
            effect: item.effect,
            textOverlay: item.textOverlay,
            reviewDecision: "NOT_APPLICABLE",
            selectedBroll: null,
          };
        }

        const review = brollReviews[item.id];

        if (review?.decision === "REMOVE") {
          return {
            id: item.id,
            start: item.start,
            end: item.end,
            transcript: item.transcript,
            sourceAction: item.action,
            resolvedAction: "TALKING_HEAD",
            effect: item.effect,
            textOverlay: item.textOverlay,
            reviewDecision: "REMOVE",
            selectedBroll: null,
          };
        }

        const reviewedAsset =
          review?.selectedAssetId
            ? library.catalog.assets.find(
                (asset) => asset.id === review.selectedAssetId
              ) ?? null
            : null;

        const automaticMatch =
          !reviewedAsset
            ? matchBroll(
                library.catalog,
                item.broll,
                1
              )[0] ?? null
            : null;

        const selectedAsset =
          reviewedAsset ??
          automaticMatch?.asset ??
          null;

        const reviewDecision: FinalRenderReviewState =
          review?.decision ?? "AUTO";

        return {
          id: item.id,
          start: item.start,
          end: item.end,
          transcript: item.transcript,
          sourceAction: item.action,
          resolvedAction: selectedAsset
            ? "BROLL"
            : "TALKING_HEAD",
          effect: item.effect,
          textOverlay: item.textOverlay,
          reviewDecision,
          selectedBroll: selectedAsset
            ? {
                assetId: selectedAsset.id,
                filename: selectedAsset.filename,
                path: selectedAsset.path,
                orientation: selectedAsset.orientation,
                source: selectedAsset.source,
              }
            : null,
        };
      }),
    };
  }, [editPlan, library, brollReviews]);

  const impactCandidateItems =
    finalRenderPlan?.items.filter(
      (item) =>
        item.effect ===
          "KEY_STATEMENT" ||
        item.sourceAction ===
          "KEY_STATEMENT"
    ) ?? [];

  const impactCandidateCount =
    impactCandidateItems.length;

  const finalBrollCount =
    finalRenderPlan?.items.filter(
      (item) => item.resolvedAction === "BROLL"
    ).length ?? 0;

  const removedBrollCount =
    finalRenderPlan?.items.filter(
      (item) => item.reviewDecision === "REMOVE"
    ).length ?? 0;

  const pendingBrollCount =
    finalRenderPlan?.items.filter(
      (item) => item.reviewDecision === "PENDING"
    ).length ?? 0;

  /*
    Si cambia el plan final después de haber renderizado,
    el preview anterior ya no representa las decisiones
    actuales y debe invalidarse.
  */
  useEffect(() => {
    setRenderedVideoUrl(null);
    setVideoRenderStatus("IDLE");
    setVideoRenderMessage(null);
  }, [
    finalRenderPlan,
    impactWordsEnabled,
  ]);

  /*
    Liberamos el Object URL del MP4 generado cuando
    se reemplaza o cuando salimos de la página.
  */
  useEffect(() => {
    return () => {
      if (renderedVideoUrl) {
        URL.revokeObjectURL(renderedVideoUrl);
      }
    };
  }, [renderedVideoUrl]);

  /*
    Cuando termina Auto Edit, abrimos automáticamente
    el Edit Plan como popup.
  */
  useEffect(() => {
    if (editPlanReady) {
      setEditPlanTab("REVIEW");
      setIsEditPlanOpen(true);
    }
  }, [editPlanReady]);

  /*
    Mientras el modal está abierto:
    - bloqueamos el scroll de la página
    - Escape cierra el modal
  */
  useEffect(() => {
    if (!isEditPlanOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEditPlanOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditPlanOpen]);

  if (!video) {
    return null;
  }

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    const element = event.currentTarget;

    let orientation: VideoMetadata["orientation"] = "Square";

    if (element.videoHeight > element.videoWidth) {
      orientation = "Vertical";
    } else if (element.videoWidth > element.videoHeight) {
      orientation = "Horizontal";
    }

    setMetadata({
      duration: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
      orientation,
    });
  }

  function exportEditPlanJson() {
    if (!editPlan || !video) {
      return;
    }

    const json = JSON.stringify(editPlan, null, 2);

    const blob = new Blob([json], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    const cleanVideoName = video.file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    anchor.href = url;

    anchor.download = `${cleanVideoName || "cutpilot"}-edit-plan.json`;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(url);
  }

  async function handlePrepareRenderWorkspace() {
    if (!finalRenderPlan || !library || !video) {
      return;
    }

    setRenderWorkspaceStatus("PREPARING");
    setRenderWorkspaceMessage(
      "Resolviendo archivos locales y cargándolos en FFmpeg..."
    );

    try {
      /*
        Un mismo asset puede aparecer en más de un bloque.
        Solo necesitamos escribirlo una vez en el filesystem
        virtual de FFmpeg.
      */
      const uniqueBrolls = new Map<
        string,
        NonNullable<
          FinalRenderPlan["items"][number]["selectedBroll"]
        >
      >();

      for (const item of finalRenderPlan.items) {
        if (
          item.resolvedAction === "BROLL" &&
          item.selectedBroll
        ) {
          uniqueBrolls.set(
            item.selectedBroll.assetId,
            item.selectedBroll
          );
        }
      }

      const renderBrollInputs: RenderBrollInput[] = [];

      /*
        Resolvemos los File de forma secuencial para no
        disparar varias lecturas pesadas al mismo tiempo.
      */
      for (const broll of uniqueBrolls.values()) {
        const file = await getBrollFile(
          library.rootHandle,
          broll.path
        );

        renderBrollInputs.push({
          assetId: broll.assetId,
          path: broll.path,
          file,
        });
      }

      const workspace =
        await prepareRenderWorkspace(
          video.file,
          renderBrollInputs
        );

      /*
        Este paso solo valida que todo pueda resolverse y
        cargarse correctamente. Todavía no renderizamos.

        Limpiamos el filesystem virtual al terminar para no
        dejar archivos pesados ocupando memoria.
      */
      await workspace.cleanup();

      setRenderWorkspaceStatus("READY");

      setRenderWorkspaceMessage(
        `Workspace validado: video original + ${renderBrollInputs.length} B-roll único${
          renderBrollInputs.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      console.error(
        "CutPilot render workspace error:",
        error
      );

      setRenderWorkspaceStatus("FAILED");

      setRenderWorkspaceMessage(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el workspace de render."
      );
    }
  }


  async function handleRenderVideo() {
    if (
      !finalRenderPlan ||
      !library ||
      !video ||
      !metadata
    ) {
      return;
    }

    setVideoRenderStatus("PREPARING");
    setVideoRenderMessage(
      "Preparando video original y B-roll seleccionados..."
    );

    setRenderedVideo(null);
    setRenderedVideoUrl(null);

    let workspace:
      | Awaited<
          ReturnType<typeof prepareRenderWorkspace>
        >
      | null = null;

    try {
      /*
        Igual que en PREPARE INPUTS, cada asset se carga
        una sola vez aunque se utilice en varios bloques.
      */
      const uniqueBrolls = new Map<
        string,
        NonNullable<
          FinalRenderPlan["items"][number]["selectedBroll"]
        >
      >();

      for (const item of finalRenderPlan.items) {
        if (
          item.resolvedAction === "BROLL" &&
          item.selectedBroll
        ) {
          uniqueBrolls.set(
            item.selectedBroll.assetId,
            item.selectedBroll
          );
        }
      }

      const renderBrollInputs: RenderBrollInput[] = [];

      for (const broll of uniqueBrolls.values()) {
        const file = await getBrollFile(
          library.rootHandle,
          broll.path
        );

        renderBrollInputs.push({
          assetId: broll.assetId,
          path: broll.path,
          file,
        });
      }

      workspace = await prepareRenderWorkspace(
        video.file,
        renderBrollInputs
      );

      const brollSegments: RenderBrollSegment[] = [];

      for (const item of finalRenderPlan.items) {
        if (
          item.resolvedAction === "BROLL" &&
          item.selectedBroll
        ) {
          brollSegments.push({
            assetId: item.selectedBroll.assetId,
            start: item.start,
            end: item.end,
          });
        }
      }

      const effectSegments: RenderEffectSegment[] = [];

      for (const item of finalRenderPlan.items) {
        if (item.effect === "SUBTLE_PUNCH_IN") {
          effectSegments.push({
            type: "SUBTLE_PUNCH_IN",
            start: item.start,
            end: item.end,
          });
        }
      }

      const impactSegments: RenderImpactSegment[] =
        impactWordsEnabled
          ? impactCandidateItems
              .map(
                (item) => {
                  const words =
                    subtitleCues
                      .flatMap(
                        (cue) =>
                          cue.words
                      )
                      .filter(
                        (word) =>
                          word.start <
                            item.end &&
                          word.end >
                            item.start
                      )
                      .map(
                        (word) => ({
                          word:
                            word.word,

                          start:
                            Math.max(
                              item.start,
                              word.start
                            ),

                          end:
                            Math.min(
                              item.end,
                              word.end
                            ),
                        })
                      );

                  return {
                    start:
                      item.start,

                    end:
                      item.end,

                    words,
                  };
                }
              )
              .filter(
                (segment) =>
                  segment.words.length >
                    0
              )
          : [];

      /*
        Cuando IMPACT WORDS está activo, un cue normal
        que toca ese segmento se elimina del timeline de
        captions. El propio efecto ya muestra las palabras
        en pantalla y no queremos texto duplicado abajo.
      */
      const subtitleSegments: RenderSubtitleSegment[] =
        subtitleCues
          .filter(
            (cue) =>
              !impactSegments.some(
                (impact) =>
                  cue.start <
                    impact.end &&
                  cue.end >
                    impact.start
              )
          )
          .map(
            (cue) => ({
              start:
                cue.start,

              end:
                cue.end,

              text:
                cue.text,

              words:
                cue.words.map(
                  (word) => ({
                    word:
                      word.word,

                    start:
                      word.start,

                    end:
                      word.end,
                  })
                ),
            })
          );

      setVideoRenderStatus("RENDERING");
      setVideoRenderMessage(
        `Renderizando ${brollSegments.length} bloque${
          brollSegments.length === 1 ? "" : "s"
        } de B-roll...`
      );

      const renderedFile =
        await renderVideoFromWorkspace(
          workspace,
          {
            width: metadata.width,
            height: metadata.height,
            duration: metadata.duration,
            brollSegments,
            effectSegments,
            subtitleSegments,
            impactSegments,
          }
        );

      const previewUrl =
        URL.createObjectURL(renderedFile);

      /*
        Guardamos el MP4 real en la sesión global
        SIN cambiar el pipeline de render que ya
        funcionaba con B-roll + subtítulos.
      */
      setRenderedVideo(renderedFile);

      setRenderedVideoUrl(previewUrl);
      setVideoRenderStatus("READY");
      setVideoRenderMessage(
        `Render listo: ${formatBytes(renderedFile.size)}. Revisa el preview antes de continuar.`
      );
    } catch (error) {
      console.error(
        "CutPilot video render error:",
        error
      );

      setVideoRenderStatus("FAILED");
      setVideoRenderMessage(
        error instanceof Error
          ? error.message
          : "No se pudo renderizar el video."
      );
    } finally {
      if (workspace) {
        await workspace.cleanup();
      }
    }
  }

  return (
    <main className="min-h-screen px-5 py-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            ← Volver
          </button>

          <div className="text-xl font-black tracking-[-0.05em]">
            CUT
            <span className="text-lime-300">PILOT</span>
          </div>
        </header>

        <section className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/5 px-3 py-1 text-xs font-medium text-lime-200">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
            AUTO EDIT
          </div>

          <h1 className="text-4xl font-black tracking-[-0.05em] md:text-6xl">
            {editPlanReady ? "Edit Plan listo." : "Preparando tu edición."}
          </h1>

          <p className="mt-4 max-w-xl text-slate-400">
            {editPlanReady
              ? "CutPilot ya decidió dónde mantener tu rostro, dónde usar B-roll y dónde aplicar énfasis."
              : "CutPilot analiza el contenido antes de construir el plan editorial."}
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-4 md:p-5">
              <div className="overflow-hidden rounded-[1.4rem] bg-black">
                <video
                  src={video.url}
                  controls
                  playsInline
                  onLoadedMetadata={handleLoadedMetadata}
                  className="mx-auto max-h-[70vh] w-full object-contain"
                />
              </div>
            </div>

            {editPlan && (
              <div className="rounded-[2rem] border border-lime-300/15 bg-lime-300/[0.025] p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-lime-300">
                      EDIT PLAN READY
                    </p>

                    <h2 className="mt-2 text-xl font-black tracking-[-0.03em]">
                      Decisiones editoriales
                    </h2>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                      {editPlan.summary}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
                        {editPlan.items.length} decisiones
                      </span>

                      <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-xs text-cyan-200">
                        {brollCount} B-roll
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsEditPlanOpen(true)}
                    className="shrink-0 rounded-2xl bg-lime-300 px-5 py-3 text-sm font-black text-black transition hover:bg-lime-200"
                  >
                    OPEN EDIT PLAN
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
                VIDEO
              </p>

              <p className="mt-4 break-all text-sm font-medium text-slate-200">
                {video.file.name}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs text-slate-500">DURACIÓN</p>

                  <p className="mt-2 text-lg font-bold text-white">
                    {metadata ? formatDuration(metadata.duration) : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs text-slate-500">TAMAÑO</p>

                  <p className="mt-2 text-lg font-bold text-white">
                    {formatBytes(video.file.size)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs text-slate-500">RESOLUCIÓN</p>

                  <p className="mt-2 text-lg font-bold text-white">
                    {metadata ? `${metadata.width}×${metadata.height}` : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs text-slate-500">ORIENTACIÓN</p>

                  <p className="mt-2 text-lg font-bold text-white">
                    {metadata?.orientation ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            {metadata && validation.warnings.length > 0 && (
              <div className="rounded-[2rem] border border-amber-300/15 bg-amber-300/[0.04] p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-amber-200">
                  WARNING
                </p>

                <div className="mt-3 space-y-2">
                  {validation.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="text-sm leading-6 text-amber-100/70"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {failed && autoEditError && (
              <div className="rounded-[2rem] border border-red-400/15 bg-red-400/[0.04] p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-red-300">
                  AUTO EDIT FAILED
                </p>

                <p className="mt-3 text-sm leading-6 text-red-200/70">
                  {autoEditError}
                </p>
              </div>
            )}

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-300">
                  Estado
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    failed
                      ? "bg-red-400/10 text-red-300"
                      : editPlanReady
                        ? "bg-lime-300/10 text-lime-200"
                        : isAnalyzing
                          ? "bg-cyan-300/10 text-cyan-200"
                          : !metadata
                            ? "bg-white/5 text-slate-400"
                            : validation.valid
                              ? "bg-lime-300/10 text-lime-200"
                              : "bg-red-400/10 text-red-300"
                  }`}
                >
                  {failed
                    ? "FAILED"
                    : editPlanReady
                      ? "EDIT PLAN READY"
                      : isAnalyzing
                        ? "ANALYZING"
                        : !metadata
                          ? "READING"
                          : validation.valid
                            ? "READY"
                            : "INVALID"}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                {failed
                  ? "Auto Edit no pudo completar el análisis."
                  : editPlanReady
                    ? "El plan editorial está listo para revisión."
                    : isAnalyzing
                      ? "CutPilot está transcribiendo y tomando decisiones editoriales."
                      : !metadata
                        ? "Leyendo metadata local del archivo..."
                        : validation.valid
                          ? "El video pasó la validación y puede comenzar Auto Edit."
                          : "Este archivo no puede procesarse correctamente."}
              </p>

              <button
                onClick={startAutoEdit}
                disabled={!validation.valid || isAnalyzing || editPlanReady}
                className={`mt-6 w-full rounded-2xl px-5 py-4 font-black transition ${
                  validation.valid && !isAnalyzing && !editPlanReady
                    ? "bg-lime-300 text-black hover:bg-lime-200"
                    : "cursor-not-allowed bg-lime-300 text-black opacity-30"
                }`}
              >
                {editPlanReady
                  ? "EDIT PLAN READY"
                  : isAnalyzing
                    ? "ANALYZING..."
                    : failed
                      ? "RETRY AUTO EDIT"
                      : "START AUTO EDIT"}
              </button>
            </div>
          </aside>
        </section>
      </div>

      {isEditPlanOpen && editPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6">
          <button
            type="button"
            aria-label="Cerrar Edit Plan"
            onClick={() => setIsEditPlanOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="CutPilot Edit Plan"
            className="relative z-10 h-[92vh] w-full max-w-6xl overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-[#0b1018] shadow-2xl shadow-black/60"
          >
            <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b1018]/95 px-4 py-4 backdrop-blur-xl md:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-lime-300/15 bg-lime-300/[0.05] px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-lime-200">
                      EDIT PLAN
                    </span>

                    <span className="text-[11px] text-slate-500">
                      {brollCount} B-roll
                    </span>
                  </div>

                  <h2 className="mt-1 truncate text-xl font-black tracking-[-0.04em] md:text-2xl">
                    {editPlanTab === "REVIEW" ? "B-roll Review" : "Render"}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={exportEditPlanJson}
                    className="hidden rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold text-slate-400 transition hover:border-white/20 hover:text-white sm:block"
                  >
                    JSON
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEditPlanOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-lg text-slate-400 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-1.5">
                <button
                  type="button"
                  onClick={() => setEditPlanTab("REVIEW")}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
                    editPlanTab === "REVIEW"
                      ? "bg-white/[0.08] text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  REVIEW B-ROLL
                </button>

                <button
                  type="button"
                  onClick={() => setEditPlanTab("RENDER")}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${
                    editPlanTab === "RENDER"
                      ? "bg-lime-300 text-black"
                      : "text-lime-200 hover:bg-lime-300/[0.06]"
                  }`}
                >
                  RENDER VIDEO
                </button>
              </div>
            </header>

            <div className="relative z-0 px-4 py-4 md:px-6 md:py-5">
              {editPlanTab === "REVIEW" ? (
                <div className="mx-auto max-w-4xl">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
                      {brollCount} CLIPS
                    </span>

                    {removedBrollCount > 0 && (
                      <span className="rounded-full border border-red-300/15 bg-red-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-red-200">
                        {removedBrollCount} REMOVED
                      </span>
                    )}

                    {pendingBrollCount > 0 && (
                      <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-2.5 py-1 text-[10px] font-semibold text-amber-200">
                        {pendingBrollCount} PENDING
                      </span>
                    )}

                    <details className="ml-auto">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-300">
                        Ver resumen
                      </summary>

                      <div className="mt-2 max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs leading-5 text-slate-400">
                        {editPlan.summary}
                      </div>
                    </details>
                  </div>

                  <div className="space-y-4">
                    {editPlan.items
                      .filter((item) => item.action === "BROLL" && item.broll)
                      .map((item) => (
                        <section
                          key={item.id}
                          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20"
                        >
                          <div className="flex flex-col gap-2 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
                                  {formatTimestamp(item.start)} → {formatTimestamp(item.end)}
                                </span>

                                <span className="rounded-md bg-lime-300/10 px-2 py-1 text-[10px] font-semibold text-lime-200">
                                  B-ROLL
                                </span>

                                <span className="text-[10px] font-semibold text-slate-600">
                                  {brollReviews[item.id]?.decision ?? "AUTO"}
                                </span>
                              </div>

                              <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">
                                “{item.transcript}”
                              </p>
                            </div>
                          </div>

                          <div className="p-3 md:p-4">
                            {library && item.broll && (
                              <BrollMatchList
                                itemId={item.id}
                                catalog={library.catalog}
                                request={item.broll}
                              />
                            )}
                          </div>
                        </section>
                      ))}
                  </div>

                  <details className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                    <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-300">
                      Otras decisiones editoriales ({editPlan.items.filter((item) => item.action !== "BROLL").length})
                    </summary>

                    <div className="space-y-1 border-t border-white/[0.06] p-3">
                      {editPlan.items
                        .filter((item) => item.action !== "BROLL")
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs"
                          >
                            <span className="shrink-0 text-cyan-200">
                              {formatTimestamp(item.start)}
                            </span>
                            <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-1 font-semibold text-slate-400">
                              {item.action}
                            </span>
                            <span className="truncate text-slate-500">
                              {item.transcript}
                            </span>
                          </div>
                        ))}
                    </div>
                  </details>
                </div>
              ) : (
                <div className="mx-auto max-w-4xl">
                  <section className="rounded-2xl border border-lime-300/15 bg-lime-300/[0.025] p-4 md:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.16em] text-lime-300">
                          READY TO RENDER
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {finalBrollCount} B-roll · audio original
                          {impactWordsEnabled && impactCandidateCount > 0
                            ? " · Impact Words"
                            : ""}{" "}
                          · MP4
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRenderVideo}
                        disabled={
                          videoRenderStatus === "PREPARING" ||
                          videoRenderStatus === "RENDERING"
                        }
                        className={`rounded-xl px-5 py-3 text-sm font-black transition ${
                          videoRenderStatus === "PREPARING" ||
                          videoRenderStatus === "RENDERING"
                            ? "cursor-not-allowed bg-lime-300/10 text-lime-200/50"
                            : "bg-lime-300 text-black hover:bg-lime-200"
                        }`}
                      >
                        {videoRenderStatus === "PREPARING"
                          ? "PREPARING..."
                          : videoRenderStatus === "RENDERING"
                            ? "RENDERING..."
                            : "RENDER VIDEO"}
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.025] p-4">
                      <label
                        className={`flex items-start gap-3 ${
                          impactCandidateCount > 0
                            ? "cursor-pointer"
                            : "cursor-not-allowed opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={impactWordsEnabled}
                          onChange={(event) =>
                            setImpactWordsEnabled(
                              event.target.checked
                            )
                          }
                          disabled={
                            impactCandidateCount === 0 ||
                            videoRenderStatus === "PREPARING" ||
                            videoRenderStatus === "RENDERING"
                          }
                          className="mt-0.5 h-5 w-5 shrink-0 accent-fuchsia-300"
                        />

                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black tracking-[0.08em] text-fuchsia-200">
                              IMPACT WORDS
                            </span>

                            <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              OPTIONAL
                            </span>
                          </span>

                          <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                            Oscurece ligeramente el video, muestra cada palabra al centro con brillo y agrega un click de cámara por palabra.
                          </span>

                          <span className="mt-1 block text-[10px] leading-5 text-slate-600">
                            {impactCandidateCount > 0
                              ? `${impactCandidateCount} momento${
                                  impactCandidateCount === 1 ? "" : "s"
                                } KEY_STATEMENT detectado${
                                  impactCandidateCount === 1 ? "" : "s"
                                }. Los subtítulos normales se ocultan dentro de esos segmentos.`
                              : "No hay momentos KEY_STATEMENT en este Edit Plan."}
                          </span>
                        </span>
                      </label>
                    </div>

                    {(videoRenderMessage || renderWorkspaceMessage) && (
                      <div className="mt-4 space-y-1">
                        {videoRenderMessage && (
                          <p
                            className={`text-xs leading-5 ${
                              videoRenderStatus === "READY"
                                ? "text-lime-200"
                                : videoRenderStatus === "FAILED"
                                  ? "text-red-200"
                                  : "text-cyan-200"
                            }`}
                          >
                            {videoRenderMessage}
                          </p>
                        )}

                        {renderWorkspaceMessage && (
                          <p
                            className={`text-xs leading-5 ${
                              renderWorkspaceStatus === "READY"
                                ? "text-lime-200/70"
                                : renderWorkspaceStatus === "FAILED"
                                  ? "text-red-200"
                                  : "text-slate-500"
                            }`}
                          >
                            {renderWorkspaceMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </section>

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
                            {subtitleCues.length} bloques generados
                          </p>
                        </div>

                        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-2.5 py-1 text-[10px] font-semibold text-cyan-200">
                          WORD TIMESTAMPS
                        </span>
                      </div>
                    </summary>

                    <div className="border-t border-white/[0.06]">
                      {subtitleCues.length > 0 ? (
                        <div className="max-h-[300px] overflow-y-auto p-3">
                          <div className="space-y-1.5">
                            {subtitleCues.map((cue) => (
                              <div
                                key={cue.id}
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
                      ) : (
                        <div className="px-4 py-5 text-sm text-slate-500 md:px-5">
                          No hay word timestamps disponibles para generar subtítulos.
                        </div>
                      )}
                    </div>
                  </details>

                  {renderedVideoUrl ? (
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
                          Primero ejecuta RENDER VIDEO.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrepareRenderWorkspace}
                      disabled={
                        renderWorkspaceStatus === "PREPARING" ||
                        videoRenderStatus === "PREPARING" ||
                        videoRenderStatus === "RENDERING"
                      }
                      className="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:border-white/20 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {renderWorkspaceStatus === "PREPARING"
                        ? "CHECKING INPUTS..."
                        : "CHECK INPUTS"}
                    </button>

                    <span className="text-[10px] text-slate-700">
                      Diagnóstico opcional
                    </span>
                  </div>

                  {finalRenderPlan && (
                    <details className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-300">
                        Ver Render Plan
                      </summary>

                      <div className="space-y-2 border-t border-white/[0.06] p-3">
                        {finalRenderPlan.items
                          .filter(
                            (item) =>
                              item.sourceAction === "BROLL" ||
                              item.resolvedAction === "BROLL"
                          )
                          .map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-col gap-1 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                            >
                              <span className="shrink-0 text-[10px] font-semibold text-cyan-200">
                                {formatTimestamp(item.start)} → {formatTimestamp(item.end)}
                              </span>

                              <span
                                className={`shrink-0 text-[10px] font-semibold ${
                                  item.reviewDecision === "REMOVE"
                                    ? "text-red-200"
                                    : "text-lime-200"
                                }`}
                              >
                                {item.reviewDecision}
                              </span>

                              <span className="truncate text-[11px] text-slate-500">
                                {item.selectedBroll?.filename ?? "Talking head"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {editPlanTab === "RENDER" && renderedVideoUrl && (
              <footer className="sticky bottom-0 z-30 border-t border-white/[0.07] bg-[#0b1018]/95 px-4 py-3 backdrop-blur-xl md:px-6">
                <div className="mx-auto flex max-w-4xl items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-lime-200">
                      RENDER READY
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      MP4 listo para YouTube Shorts + TikTok
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/publish")}
                    className="shrink-0 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black tracking-[0.03em] text-slate-950 transition hover:bg-lime-200"
                  >
                    CONTINUE TO PUBLISH
                  </button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
