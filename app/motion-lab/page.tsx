"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildMotionTimeline,
} from "@/lib/motion/buildMotionTimeline";

import type {
  MotionTimeline,
  WebComparisonMotionGraphicRequest,
} from "@/lib/motion/types";

const PREVIEW_WIDTH = 1080;
const PREVIEW_HEIGHT = 1920;
const PREVIEW_DURATION = 8;

const demoGraphic:
  WebComparisonMotionGraphicRequest = {
    type: "WEB_COMPARISON",

    label:
      "SIN DIRECCIÓN VS CON OBJETIVO",

    leftTitle:
      "SIN DIRECCIÓN",

    leftHeadline:
      "TODO PARA TU NEGOCIO EN UN SOLO LUGAR",

    leftIssues: [
      "HERO SATURADO",
      "DEMASIADOS ÍCONOS",
      "SIN JERARQUÍA",
    ],

    rightTitle:
      "CON OBJETIVO",

    rightHeadline:
      "AGENDA TU CONSULTA HOY",

    rightStrengths: [
      "MENSAJE CLARO",
      "CTA PRINCIPAL",
      "ENFOQUE EN CONVERSIÓN",
    ],

    rightCta:
      "AGENDAR CITA",
  };

function createAssetUrls(
  timeline: MotionTimeline
) {
  const urls =
    new Map<string, string>();

  for (
    const asset of
    timeline.assets
  ) {
    const copy =
      Uint8Array.from(
        asset.data
      );

    const blob =
      new Blob(
        [copy],
        {
          type: "image/png",
        }
      );

    urls.set(
      asset.key,
      URL.createObjectURL(
        blob
      )
    );
  }

  return urls;
}

export default function MotionLabPage() {
  const [
    timeline,
    setTimeline,
  ] =
    useState<MotionTimeline | null>(
      null
    );

  const [
    assetUrls,
    setAssetUrls,
  ] =
    useState<Map<
      string,
      string
    > | null>(null);

  const [
    frameIndex,
    setFrameIndex,
  ] =
    useState(0);

  const [
    isPlaying,
    setIsPlaying,
  ] =
    useState(false);

  const [
    isBuilding,
    setIsBuilding,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    let cancelled =
      false;

    let createdUrls:
      Map<string, string> |
      null =
        null;

    async function buildPreview() {
      try {
        setIsBuilding(
          true
        );

        setError(
          null
        );

        const nextTimeline =
          await buildMotionTimeline({
            width:
              PREVIEW_WIDTH,

            height:
              PREVIEW_HEIGHT,

            duration:
              PREVIEW_DURATION,

            segments: [
              {
                start: 0,

                end:
                  PREVIEW_DURATION,

                graphic:
                  demoGraphic,
              },
            ],
          });

        if (
          cancelled
        ) {
          return;
        }

        createdUrls =
          createAssetUrls(
            nextTimeline
          );

        setTimeline(
          nextTimeline
        );

        setAssetUrls(
          createdUrls
        );

        setFrameIndex(
          0
        );

        setIsPlaying(
          true
        );
      } catch (
        previewError
      ) {
        console.error(
          "WEB_COMPARISON preview error:",
          previewError
        );

        if (
          cancelled
        ) {
          return;
        }

        setError(
          previewError
            instanceof Error
            ? previewError.message
            : "No se pudo generar el preview."
        );
      } finally {
        if (
          !cancelled
        ) {
          setIsBuilding(
            false
          );
        }
      }
    }

    void buildPreview();

    return () => {
      cancelled =
        true;

      if (
        createdUrls
      ) {
        for (
          const url of
          createdUrls.values()
        ) {
          URL.revokeObjectURL(
            url
          );
        }
      }
    };
  }, []);

  useEffect(() => {
    if (
      !timeline ||
      !isPlaying ||
      timeline.frames.length ===
        0
    ) {
      return;
    }

    const frame =
      timeline.frames[
        frameIndex
      ];

    if (
      !frame
    ) {
      setIsPlaying(
        false
      );

      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          const nextIndex =
            frameIndex + 1;

          if (
            nextIndex >=
            timeline.frames.length
          ) {
            setIsPlaying(
              false
            );

            return;
          }

          setFrameIndex(
            nextIndex
          );
        },
        Math.max(
          16,
          frame.duration *
            1000
        )
      );

    return () => {
      window.clearTimeout(
        timeout
      );
    };
  }, [
    frameIndex,
    isPlaying,
    timeline,
  ]);

  const currentFrame =
    timeline?.frames[
      frameIndex
    ] ?? null;

  const currentImageUrl =
    currentFrame &&
    assetUrls
      ? assetUrls.get(
          currentFrame.assetKey
        ) ?? null
      : null;

  const elapsed =
    useMemo(
      () => {
        if (
          !timeline
        ) {
          return 0;
        }

        let total =
          0;

        for (
          let index = 0;
          index < frameIndex;
          index += 1
        ) {
          total +=
            timeline.frames[
              index
            ]?.duration ??
            0;
        }

        return total;
      },
      [
        frameIndex,
        timeline,
      ]
    );

  function restart() {
    if (
      !timeline ||
      timeline.frames.length ===
        0
    ) {
      return;
    }

    setFrameIndex(
      0
    );

    setIsPlaying(
      true
    );
  }

  function togglePlayback() {
    if (
      !timeline ||
      timeline.frames.length ===
        0
    ) {
      return;
    }

    if (
      frameIndex >=
      timeline.frames.length -
        1
    ) {
      setFrameIndex(
        0
      );

      setIsPlaying(
        true
      );

      return;
    }

    setIsPlaying(
      (current) =>
        !current
    );
  }

  return (
    <main className="min-h-screen bg-[#07080b] px-5 py-8 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section>
          <p className="text-[11px] font-black tracking-[0.18em] text-violet-300">
            MOTION LAB
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight">
            WEB_COMPARISON V0
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Preview aislado usando el mismo Motion Template Registry y
            buildMotionTimeline() que consume el renderer final.
          </p>

          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-xs font-bold text-slate-300">
              Demo
            </p>

            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
              <p>
                Sin dirección: hero saturado, demasiados iconos y poca
                jerarquía.
              </p>

              <p>
                Con objetivo: mensaje claro, CTA principal y enfoque en
                conversión.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={
                togglePlayback
              }
              disabled={
                isBuilding ||
                !timeline
              }
              className="rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-black text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {
                isPlaying
                  ? "PAUSE"
                  : "PLAY"
              }
            </button>

            <button
              type="button"
              onClick={
                restart
              }
              disabled={
                isBuilding ||
                !timeline
              }
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              RESTART
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-slate-500">
            {isBuilding ? (
              <span>
                Generando timeline…
              </span>
            ) : error ? (
              <span className="text-red-300">
                {error}
              </span>
            ) : timeline ? (
              <span>
                {frameIndex + 1}/{timeline.frames.length} frames ·{" "}
                {elapsed.toFixed(2)}s / {PREVIEW_DURATION.toFixed(2)}s
              </span>
            ) : (
              <span>
                Sin timeline.
              </span>
            )}
          </div>
        </section>

        <section className="flex justify-center lg:justify-end">
          <div className="relative aspect-[9/16] w-full max-w-[405px] overflow-hidden rounded-[28px] border border-white/[0.10] bg-black shadow-2xl">
            {currentImageUrl ? (
              <img
                src={
                  currentImageUrl
                }
                alt="WEB_COMPARISON Motion Graphic preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-600">
                {
                  isBuilding
                    ? "Generando Motion Graphic…"
                    : error
                      ? "Preview no disponible"
                      : "Sin frame"
                }
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
