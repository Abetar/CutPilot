"use client";

import { useEffect, useMemo, useState } from "react";

import {
  matchBroll,
  type BrollMatchRequest,
} from "@/lib/broll/matchBroll";

import type {
  BrollCatalog,
} from "@/lib/broll/types";

import {
  createBrollPreviewUrl,
  getBrollFile,
  revokeBrollPreviewUrl,
} from "@/lib/broll/localLibrary";

import { useBrollLibrary } from "@/components/BrollLibraryProvider";

type Props = {
  catalog: BrollCatalog;
  request: BrollMatchRequest;
  selectedAssetId: string | null;
  onSelect: (assetId: string | null) => void;
};

export function BrollEngineMatchList({
  catalog,
  request,
  selectedAssetId,
  onSelect,
}: Props) {
  const { library } = useBrollLibrary();

  const matches = useMemo(
    () => matchBroll(catalog, request, 3),
    [catalog, request]
  );

  const bestMatch =
    matches[0] ?? null;

  const selectedMatch =
    matches.find(
      (match) =>
        match.asset.id === selectedAssetId
    ) ??
    bestMatch;

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [previewError, setPreviewError] =
    useState<string | null>(null);

  /*
    En B-Roll Engine siempre debe existir
    una selección visual.

    Si todavía no hay decisión explícita,
    adoptamos automáticamente el BEST match.
  */
  useEffect(() => {
    if (matches.length === 0) {
      if (selectedAssetId !== null) {
        onSelect(null);
      }

      return;
    }

    const selectedStillExists =
      selectedAssetId
        ? matches.some(
            (match) =>
              match.asset.id ===
              selectedAssetId
          )
        : false;

    if (!selectedStillExists) {
      onSelect(
        bestMatch?.asset.id ?? null
      );
    }
  }, [
    matches,
    selectedAssetId,
    bestMatch?.asset.id,
    onSelect,
  ]);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function loadPreview() {
      setPreviewUrl(null);
      setPreviewError(null);

      if (!library || !selectedMatch) {
        return;
      }

      setPreviewLoading(true);

      try {
        const file =
          await getBrollFile(
            library.rootHandle,
            selectedMatch.asset.path
          );

        if (cancelled) {
          return;
        }

        createdUrl =
          createBrollPreviewUrl(file);

        setPreviewUrl(createdUrl);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "CutPilot B-Roll Engine preview error:",
          error
        );

        setPreviewError(
          error instanceof Error
            ? error.message
            : "No se pudo abrir el B-roll seleccionado."
        );
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;

      if (createdUrl) {
        revokeBrollPreviewUrl(
          createdUrl
        );
      }
    };
  }, [
    library,
    selectedMatch?.asset.path,
  ]);

  if (matches.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-4">
        <p className="text-xs font-bold tracking-[0.14em] text-amber-200">
          NO LOCAL MATCH
        </p>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          No se encontró un candidato suficientemente relacionado para este segmento.
          Este punto tendrá que resolverse antes del render.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {selectedMatch && (
        <div className="overflow-hidden rounded-2xl border border-lime-300/20 bg-lime-300/[0.02]">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold tracking-[0.14em] text-lime-200">
                  SELECTED B-ROLL
                </p>

                {selectedMatch.asset.id ===
                  bestMatch?.asset.id && (
                  <span className="rounded-full bg-lime-300/10 px-2 py-1 text-[9px] font-bold text-lime-200">
                    BEST MATCH
                  </span>
                )}
              </div>

              <p className="mt-1 max-w-[620px] truncate text-xs text-slate-300">
                {selectedMatch.asset.filename}
              </p>

              <p className="mt-1 max-w-[620px] truncate text-[10px] text-slate-600">
                {selectedMatch.asset.path}
              </p>
            </div>

            <span className="shrink-0 rounded-full bg-lime-300/10 px-2 py-1 text-[10px] font-bold text-lime-200">
              SCORE {selectedMatch.score}
            </span>
          </div>

          <div className="bg-black">
            {previewLoading && (
              <div className="flex min-h-[220px] items-center justify-center px-6 text-center">
                <p className="text-xs text-slate-500">
                  Loading local preview...
                </p>
              </div>
            )}

            {!previewLoading &&
              previewError && (
                <div className="flex min-h-[160px] items-center justify-center px-6 text-center">
                  <p className="text-xs leading-5 text-red-300/80">
                    {previewError}
                  </p>
                </div>
              )}

            {!previewLoading &&
              !previewError &&
              previewUrl && (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="mx-auto max-h-[360px] w-full bg-black object-contain"
                />
              )}
          </div>

          {selectedMatch.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-3 py-3">
              {selectedMatch.reasons.map(
                (reason) => (
                  <span
                    key={reason}
                    className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500"
                  >
                    {reason}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-[0.14em] text-cyan-200">
            LOCAL ALTERNATIVES
          </p>

          <span className="text-[10px] text-slate-600">
            Top {matches.length}
          </span>
        </div>

        <div className="space-y-2">
          {matches.map(
            (match, index) => {
              const isSelected =
                selectedMatch?.asset.id ===
                match.asset.id;

              return (
                <button
                  type="button"
                  key={match.asset.id}
                  onClick={() =>
                    onSelect(match.asset.id)
                  }
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-lime-300/25 bg-lime-300/[0.04]"
                      : "border-white/[0.07] bg-black/10 hover:border-cyan-300/25 hover:bg-cyan-300/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {index === 0 && (
                          <span className="rounded-full bg-lime-300/10 px-2 py-0.5 text-[10px] font-bold text-lime-200">
                            BEST
                          </span>
                        )}

                        {isSelected && (
                          <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
                            SELECTED
                          </span>
                        )}

                        <span className="text-[11px] font-semibold text-slate-500">
                          SCORE {match.score}
                        </span>
                      </div>

                      <p className="mt-2 break-all text-xs font-medium leading-5 text-slate-200">
                        {match.asset.filename}
                      </p>

                      <p className="mt-1 break-all text-[11px] leading-4 text-slate-600">
                        {match.asset.path}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase tracking-wide text-slate-600">
                        {match.asset.orientation}
                      </p>

                      {match.asset.sourceName && (
                        <p className="mt-1 text-[10px] text-slate-600">
                          {match.asset.sourceName}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
