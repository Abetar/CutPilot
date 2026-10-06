"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useVideoSession } from "@/components/VideoSessionProvider";

type PublishMetadata = {
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
  tiktokCaption: string;
  tiktokHashtags: string[];
  thumbnailText: string;
  thumbnailSecond: number;
  thumbnailReason: string;
};

type CopyStatus =
  | "IDLE"
  | "GENERATING"
  | "READY"
  | "ERROR";

function formatTimestamp(
  value: number
) {
  const safeValue =
    Number.isFinite(value)
      ? Math.max(
          0,
          value
        )
      : 0;

  const minutes =
    Math.floor(
      safeValue / 60
    );

  const seconds =
    Math.floor(
      safeValue % 60
    );

  return `${minutes}:${seconds
    .toString()
    .padStart(
      2,
      "0"
    )}`;
}

export default function PublishPage() {
  const router =
    useRouter();

  const {
    renderedVideo,
    transcription,
    editPlan,
  } =
    useVideoSession();

  const generationStartedRef =
    useRef(false);

  const [
    previewUrl,
    setPreviewUrl,
  ] =
    useState<string | null>(null);

  const [
    publishToYouTube,
    setPublishToYouTube,
  ] =
    useState(true);

  const [
    publishToTikTok,
    setPublishToTikTok,
  ] =
    useState(true);

  const [
    youtubeTitle,
    setYoutubeTitle,
  ] =
    useState("");

  const [
    youtubeDescription,
    setYoutubeDescription,
  ] =
    useState("");

  const [
    youtubeTags,
    setYoutubeTags,
  ] =
    useState("");

  const [
    tiktokCaption,
    setTiktokCaption,
  ] =
    useState("");

  const [
    tiktokHashtags,
    setTiktokHashtags,
  ] =
    useState("");

  const [
    thumbnailText,
    setThumbnailText,
  ] =
    useState("");

  const [
    thumbnailSecond,
    setThumbnailSecond,
  ] =
    useState(0);

  const [
    thumbnailReason,
    setThumbnailReason,
  ] =
    useState("");

  const [
    copyStatus,
    setCopyStatus,
  ] =
    useState<CopyStatus>(
      "IDLE"
    );

  const [
    copyError,
    setCopyError,
  ] =
    useState<string | null>(
      null
    );

  const [
    copyAllStatus,
    setCopyAllStatus,
  ] =
    useState<
      "IDLE" | "COPIED" | "ERROR"
    >("IDLE");

  useEffect(() => {
    if (!renderedVideo) {
      setPreviewUrl(null);

      return;
    }

    const url =
      URL.createObjectURL(
        renderedVideo
      );

    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(
        url
      );
    };
  }, [renderedVideo]);

  async function generateCopy() {
    if (
      !transcription
    ) {
      setCopyError(
        "No hay transcripción disponible para generar el copy."
      );

      setCopyStatus(
        "ERROR"
      );

      return;
    }

    setCopyStatus(
      "GENERATING"
    );

    setCopyError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/publish/generate-copy",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                transcription,
                editPlan,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "No se pudo generar el copy."
        );
      }

      const metadata =
        data as
          PublishMetadata;

      setYoutubeTitle(
        metadata.youtubeTitle ??
          ""
      );

      setYoutubeDescription(
        metadata.youtubeDescription ??
          ""
      );

      setYoutubeTags(
        Array.isArray(
          metadata.youtubeTags
        )
          ? metadata.youtubeTags.join(
              ", "
            )
          : ""
      );

      setTiktokCaption(
        metadata.tiktokCaption ??
          ""
      );

      setTiktokHashtags(
        Array.isArray(
          metadata.tiktokHashtags
        )
          ? metadata.tiktokHashtags.join(
              " "
            )
          : ""
      );

      setThumbnailText(
        metadata.thumbnailText ??
          ""
      );

      setThumbnailSecond(
        typeof metadata.thumbnailSecond ===
          "number"
          ? metadata.thumbnailSecond
          : 0
      );

      setThumbnailReason(
        metadata.thumbnailReason ??
          ""
      );

      setCopyStatus(
        "READY"
      );
    } catch (error) {
      setCopyStatus(
        "ERROR"
      );

      setCopyError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el copy."
      );
    }
  }

  useEffect(() => {
    if (
      !renderedVideo ||
      !transcription ||
      generationStartedRef.current
    ) {
      return;
    }

    generationStartedRef.current =
      true;

    void generateCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    renderedVideo,
    transcription,
  ]);

  const selectedPlatforms =
    useMemo(
      () =>
        [
          publishToYouTube
            ? "YouTube Shorts"
            : null,
          publishToTikTok
            ? "TikTok"
            : null,
        ].filter(
          Boolean
        ) as string[],
      [
        publishToYouTube,
        publishToTikTok,
      ]
    );

  function handleDownload() {
    if (
      !renderedVideo
    ) {
      return;
    }

    const url =
      URL.createObjectURL(
        renderedVideo
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      renderedVideo.name ||
      "cutpilot-render.mp4";

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

  async function handleCopyAll() {
    const sections = [
      "YOUTUBE",
      "",
      "TITLE",
      youtubeTitle.trim() || "—",
      "",
      "DESCRIPTION",
      youtubeDescription.trim() || "—",
      "",
      "TAGS",
      youtubeTags.trim() || "—",
      "",
      "--------------------",
      "",
      "TIKTOK",
      "",
      "CAPTION",
      tiktokCaption.trim() || "—",
      "",
      "HASHTAGS",
      tiktokHashtags.trim() || "—",
      "",
      "--------------------",
      "",
      "THUMBNAIL / COVER",
      "",
      "TEXT",
      thumbnailText.trim() || "—",
      "",
      "FRAME",
      formatTimestamp(
        thumbnailSecond
      ),
      "",
      "WHY",
      thumbnailReason.trim() || "—",
    ];

    const value =
      sections.join("\n");

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(
          value
        );
      } else {
        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.value =
          value;

        textarea.setAttribute(
          "readonly",
          ""
        );

        textarea.style.position =
          "fixed";

        textarea.style.opacity =
          "0";

        document.body.appendChild(
          textarea
        );

        textarea.select();

        const copied =
          document.execCommand(
            "copy"
          );

        textarea.remove();

        if (!copied) {
          throw new Error(
            "Clipboard fallback failed."
          );
        }
      }

      setCopyAllStatus(
        "COPIED"
      );

      window.setTimeout(
        () => {
          setCopyAllStatus(
            "IDLE"
          );
        },
        2200
      );
    } catch {
      setCopyAllStatus(
        "ERROR"
      );

      window.setTimeout(
        () => {
          setCopyAllStatus(
            "IDLE"
          );
        },
        2200
      );
    }
  }

  if (!renderedVideo) {
    return (
      <main className="min-h-screen bg-[#070a0f] px-4 py-8 text-white">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/auto-edit"
              )
            }
            className="mb-6 text-sm font-semibold text-slate-400 transition hover:text-white"
          >
            ← BACK TO AUTO EDIT
          </button>

          <section className="rounded-3xl border border-white/10 bg-[#0b1018] p-8 text-center">
            <p className="text-[10px] font-black tracking-[0.16em] text-lime-200">
              PUBLISH
            </p>

            <h1 className="mt-3 text-2xl font-black">
              No rendered video found
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              Render a video first, then return here to publish it.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/auto-edit"
                )
              }
              className="mt-6 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200"
            >
              GO TO AUTO EDIT
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070a0f] px-4 py-6 text-white md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/auto-edit"
                )
              }
              className="mb-3 text-sm font-semibold text-slate-500 transition hover:text-white"
            >
              ← BACK TO AUTO EDIT
            </button>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-3 py-1 text-[10px] font-black tracking-[0.15em] text-lime-200">
                PUBLISH
              </span>

              <span className="text-xs text-slate-600">
                {(
                  renderedVideo.size /
                  (1024 * 1024)
                ).toFixed(1)}{" "}
                MB
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-black tracking-tight">
              Publish your short
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Copy generado desde el contenido real del video.
            </p>
          </div>

          <button
            type="button"
            onClick={
              handleDownload
            }
            className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs font-black tracking-[0.08em] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            ↓ DOWNLOAD MP4
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018]">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-[10px] font-black tracking-[0.15em] text-lime-200">
                  FINAL VIDEO
                </p>
              </div>

              <div className="flex justify-center bg-black/70 p-3">
                {previewUrl ? (
                  <video
                    key={
                      previewUrl
                    }
                    src={
                      previewUrl
                    }
                    controls
                    playsInline
                    preload="metadata"
                    className="block max-h-[68vh] w-auto max-w-full rounded-2xl bg-black object-contain"
                  />
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-fuchsia-300/15 bg-fuchsia-300/[0.025] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black tracking-[0.15em] text-fuchsia-200">
                  THUMBNAIL / COVER
                </p>

                {copyStatus ===
                "GENERATING" ? (
                  <span className="text-[10px] font-bold text-slate-600">
                    THINKING...
                  </span>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#070a0f] p-4">
                <p className="text-[10px] font-bold tracking-[0.12em] text-slate-600">
                  RECOMMENDED TEXT
                </p>

                <p className="mt-2 text-xl font-black tracking-tight text-white">
                  {thumbnailText ||
                    "—"}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-[#070a0f] p-3">
                  <p className="text-[9px] font-bold tracking-[0.1em] text-slate-600">
                    FRAME
                  </p>

                  <p className="mt-2 text-lg font-black text-lime-200">
                    {copyStatus ===
                    "READY"
                      ? formatTimestamp(
                          thumbnailSecond
                        )
                      : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-[#070a0f] p-3">
                  <p className="text-[9px] font-bold tracking-[0.1em] text-slate-600">
                    WHY
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-slate-400">
                    {thumbnailReason ||
                      "Se genera junto con el copy."}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[10px] leading-5 text-slate-600">
                El segundo recomendado se basa en transcript + Edit Plan; no analiza visualmente cada frame.
              </p>
            </section>
          </div>

          <section className="rounded-3xl border border-white/10 bg-[#0b1018] p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.15em] text-slate-500">
                  AI PUBLISHING COPY
                </p>

                <p className="mt-1 text-xs text-slate-600">
                  {copyStatus ===
                  "GENERATING"
                    ? "Generating platform-specific copy..."
                    : copyStatus ===
                        "READY"
                      ? "Generated. You can edit anything before publishing."
                      : copyStatus ===
                          "ERROR"
                        ? "Generation failed."
                        : "Waiting for video context."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={
                    handleCopyAll
                  }
                  disabled={
                    copyStatus ===
                      "GENERATING" ||
                    copyStatus !==
                      "READY"
                  }
                  className="rounded-xl bg-lime-300 px-4 py-2.5 text-[11px] font-black tracking-[0.06em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copyAllStatus ===
                  "COPIED"
                    ? "✓ COPIED!"
                    : copyAllStatus ===
                        "ERROR"
                      ? "COPY FAILED"
                      : "COPY ALL"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    generationStartedRef.current =
                      true;

                    void generateCopy();
                  }}
                  disabled={
                    copyStatus ===
                    "GENERATING"
                  }
                  className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-[11px] font-black tracking-[0.06em] text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-wait disabled:opacity-50"
                >
                  {copyStatus ===
                  "GENERATING"
                    ? "GENERATING..."
                    : "REGENERATE COPY"}
                </button>
              </div>
            </div>

            {copyError ? (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-xs text-red-200">
                {copyError}
              </div>
            ) : null}

            <div className="mt-6">
              <p className="text-[10px] font-black tracking-[0.15em] text-lime-200">
                YOUTUBE SHORTS
              </p>

              <div className="mt-3">
                <label className="text-[10px] font-black tracking-[0.12em] text-slate-500">
                  TITLE
                </label>

                <input
                  value={
                    youtubeTitle
                  }
                  onChange={(
                    event
                  ) =>
                    setYoutubeTitle(
                      event.target
                        .value
                    )
                  }
                  placeholder={
                    copyStatus ===
                    "GENERATING"
                      ? "Generating title..."
                      : "YouTube title"
                  }
                  maxLength={
                    100
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#070a0f] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-lime-300/40"
                />

                <div className="mt-1 text-right text-[10px] text-slate-700">
                  {
                    youtubeTitle.length
                  }
                  /100
                </div>
              </div>

              <div className="mt-4">
                <label className="text-[10px] font-black tracking-[0.12em] text-slate-500">
                  DESCRIPTION
                </label>

                <textarea
                  value={
                    youtubeDescription
                  }
                  onChange={(
                    event
                  ) =>
                    setYoutubeDescription(
                      event.target
                        .value
                    )
                  }
                  placeholder={
                    copyStatus ===
                    "GENERATING"
                      ? "Generating description..."
                      : "YouTube description"
                  }
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#070a0f] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-700 focus:border-lime-300/40"
                />
              </div>

              <div className="mt-4">
                <label className="text-[10px] font-black tracking-[0.12em] text-slate-500">
                  TAGS
                </label>

                <input
                  value={
                    youtubeTags
                  }
                  onChange={(
                    event
                  ) =>
                    setYoutubeTags(
                      event.target
                        .value
                    )
                  }
                  placeholder="iphone 15, apple, tech"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#070a0f] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-lime-300/40"
                />
              </div>
            </div>

            <div className="my-6 border-t border-white/[0.07]" />

            <div>
              <p className="text-[10px] font-black tracking-[0.15em] text-cyan-200">
                TIKTOK
              </p>

              <div className="mt-3">
                <label className="text-[10px] font-black tracking-[0.12em] text-slate-500">
                  CAPTION
                </label>

                <textarea
                  value={
                    tiktokCaption
                  }
                  onChange={(
                    event
                  ) =>
                    setTiktokCaption(
                      event.target
                        .value
                    )
                  }
                  placeholder={
                    copyStatus ===
                    "GENERATING"
                      ? "Generating TikTok caption..."
                      : "TikTok caption"
                  }
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#070a0f] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-300/40"
                />
              </div>

              <div className="mt-4">
                <label className="text-[10px] font-black tracking-[0.12em] text-slate-500">
                  HASHTAGS
                </label>

                <input
                  value={
                    tiktokHashtags
                  }
                  onChange={(
                    event
                  ) =>
                    setTiktokHashtags(
                      event.target
                        .value
                    )
                  }
                  placeholder="#iphone #apple #tech"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#070a0f] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-300/40"
                />
              </div>
            </div>

            <div className="my-6 border-t border-white/[0.07]" />

            <div>
              <p className="text-[10px] font-black tracking-[0.15em] text-slate-500">
                PLATFORMS
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 transition hover:border-white/20">
                  <div>
                    <p className="text-sm font-black">
                      YouTube Shorts
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Upload via YouTube API
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      publishToYouTube
                    }
                    onChange={(
                      event
                    ) =>
                      setPublishToYouTube(
                        event.target
                          .checked
                      )
                    }
                    className="h-5 w-5 accent-lime-300"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 transition hover:border-white/20">
                  <div>
                    <p className="text-sm font-black">
                      TikTok
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Upload via Content Posting API
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      publishToTikTok
                    }
                    onChange={(
                      event
                    ) =>
                      setPublishToTikTok(
                        event.target
                          .checked
                      )
                    }
                    className="h-5 w-5 accent-lime-300"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[0.13em] text-lime-200">
                    READY FOR INTEGRATION
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {selectedPlatforms.length >
                    0
                      ? selectedPlatforms.join(
                          " + "
                        )
                      : "Select at least one platform"}
                  </p>
                </div>

                <button
                  type="button"
                  disabled
                  title="YouTube and TikTok APIs are not connected yet."
                  className="cursor-not-allowed rounded-xl bg-lime-300/35 px-5 py-3 text-sm font-black text-slate-950/55"
                >
                  PUBLISH TO{" "}
                  {selectedPlatforms.length ===
                  2
                    ? "BOTH"
                    : selectedPlatforms.length ===
                        1
                      ? selectedPlatforms[0].toUpperCase()
                      : "SELECTED"}
                </button>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                Next step: connect OAuth + the real YouTube and TikTok upload APIs.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
