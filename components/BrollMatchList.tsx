"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
import { useVideoSession } from "@/components/VideoSessionProvider";

type Props = {
  catalog: BrollCatalog;
  request: BrollMatchRequest;

  /*
    EditPlanItem.id.

    Por ahora es opcional para que este paso
    compile sin modificar todavía auto-edit/page.tsx.
  */
  itemId?: string;
};

type ReviewDecision =
  | "PENDING"
  | "KEEP"
  | "REMOVE";

export function BrollMatchList({
  catalog,
  request,
  itemId,
}: Props) {
  const { library } =
    useBrollLibrary();

  const {
    brollReviews,
    setBrollReview,
    clearBrollReview,
  } = useVideoSession();

  const matches = useMemo(
    () =>
      matchBroll(
        catalog,
        request,
        3
      ),
    [
      catalog,
      request,
    ]
  );

  const bestMatch =
    matches[0] ?? null;

  const storedReview =
    itemId
      ? brollReviews[itemId]
      : undefined;

  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState<string | null>(
    bestMatch?.asset.id ?? null
  );

  const [
    reviewDecision,
    setReviewDecision,
  ] =
    useState<ReviewDecision>(
      "PENDING"
    );

  const [
    isReplacing,
    setIsReplacing,
  ] = useState(false);

  const [
    previewUrl,
    setPreviewUrl,
  ] =
    useState<string | null>(
      null
    );

  const [
    previewLoading,
    setPreviewLoading,
  ] = useState(false);

  const [
    previewError,
    setPreviewError,
  ] =
    useState<string | null>(
      null
    );

  const hasAlternatives =
    matches.length > 1;

  /*
    Si este componente tiene itemId,
    el estado global es la fuente de verdad.

    Si todavía no tiene itemId,
    conserva el comportamiento local actual.
  */
  useEffect(() => {
    if (itemId) {
      if (storedReview) {
        setReviewDecision(
          storedReview.decision
        );

        setSelectedAssetId(
          storedReview.selectedAssetId ??
            bestMatch?.asset.id ??
            null
        );
      } else {
        setReviewDecision(
          "PENDING"
        );

        setSelectedAssetId(
          bestMatch?.asset.id ??
            null
        );
      }

      setIsReplacing(false);

      return;
    }

    setSelectedAssetId(
      bestMatch?.asset.id ??
        null
    );

    setReviewDecision(
      "PENDING"
    );

    setIsReplacing(false);
  }, [
    itemId,
    storedReview?.decision,
    storedReview?.selectedAssetId,
    bestMatch?.asset.id,
  ]);

  const selectedMatch =
    matches.find(
      (match) =>
        match.asset.id ===
        selectedAssetId
    ) ??
    bestMatch;

  /*
    Carga del preview del asset
    actualmente seleccionado.
  */
  useEffect(() => {
    let cancelled = false;

    let createdUrl:
      | string
      | null = null;

    async function loadPreview() {
      setPreviewUrl(null);
      setPreviewError(null);

      if (
        !library ||
        !selectedMatch ||
        reviewDecision ===
          "REMOVE"
      ) {
        return;
      }

      setPreviewLoading(true);

      try {
        const file =
          await getBrollFile(
            library.rootHandle,
            selectedMatch.asset
              .path
          );

        if (cancelled) {
          return;
        }

        createdUrl =
          createBrollPreviewUrl(
            file
          );

        setPreviewUrl(
          createdUrl
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "CutPilot B-roll preview error:",
          error
        );

        setPreviewError(
          error instanceof Error
            ? error.message
            : "No se pudo abrir el B-roll seleccionado."
        );
      } finally {
        if (!cancelled) {
          setPreviewLoading(
            false
          );
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
    reviewDecision,
  ]);

  function handleKeep() {
    if (!selectedMatch) {
      return;
    }

    setReviewDecision(
      "KEEP"
    );

    setIsReplacing(false);

    if (itemId) {
      setBrollReview(
        itemId,
        {
          decision: "KEEP",

          selectedAssetId:
            selectedMatch.asset
              .id,
        }
      );
    }
  }

  function handleReplace() {
    if (!hasAlternatives) {
      return;
    }

    /*
      Entramos en modo selección.

      Todavía NO modificamos el estado
      global hasta que el usuario elija
      realmente otro candidato.
    */
    setReviewDecision(
      "PENDING"
    );

    setIsReplacing(true);
  }

  function handleRemove() {
    setReviewDecision(
      "REMOVE"
    );

    setIsReplacing(false);

    if (itemId) {
      setBrollReview(
        itemId,
        {
          decision:
            "REMOVE",

          selectedAssetId:
            null,
        }
      );
    }
  }

  function handleRestore() {
    setReviewDecision(
      "PENDING"
    );

    setSelectedAssetId(
      bestMatch?.asset.id ??
        null
    );

    setIsReplacing(false);

    if (itemId) {
      /*
        RESTORE elimina la decisión explícita
        y vuelve al BEST automático.
      */
      clearBrollReview(
        itemId
      );
    }
  }

  function selectCandidate(
    assetId: string
  ) {
    setSelectedAssetId(
      assetId
    );

    setReviewDecision(
      "PENDING"
    );

    setIsReplacing(false);

    if (itemId) {
      /*
        REPLACE ya eligió un nuevo asset,
        pero todavía queda PENDING hasta
        que el usuario pulse KEEP.
      */
      setBrollReview(
        itemId,
        {
          decision:
            "PENDING",

          selectedAssetId:
            assetId,
        }
      );
    }
  }

  if (
    matches.length === 0
  ) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-300/10 bg-amber-300/[0.03] px-4 py-3">
        <p className="text-xs font-semibold text-amber-200">
          NO LOCAL MATCH
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          No se encontró un
          candidato suficientemente
          relacionado en tu
          biblioteca.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-[0.14em] text-cyan-200">
          LOCAL B-ROLL MATCHES
        </p>

        <span className="text-[11px] text-slate-600">
          Top{" "}
          {matches.length}
        </span>
      </div>

      {selectedMatch && (
        <div
          className={`mb-3 overflow-hidden rounded-2xl border ${
            reviewDecision ===
            "KEEP"
              ? "border-lime-300/30 bg-lime-300/[0.025]"
              : reviewDecision ===
                  "REMOVE"
                ? "border-red-300/20 bg-red-300/[0.025]"
                : "border-white/10 bg-black/30"
          }`}
        >
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold tracking-[0.14em] text-lime-200">
                  SELECTED
                  B-ROLL
                </p>

                {reviewDecision ===
                  "KEEP" && (
                  <span className="rounded-full bg-lime-300/10 px-2 py-1 text-[9px] font-bold text-lime-200">
                    KEPT
                  </span>
                )}

                {reviewDecision ===
                  "REMOVE" && (
                  <span className="rounded-full bg-red-300/10 px-2 py-1 text-[9px] font-bold text-red-200">
                    REMOVED
                  </span>
                )}

                {reviewDecision ===
                  "PENDING" && (
                  <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[9px] font-bold text-slate-400">
                    PENDING
                  </span>
                )}
              </div>

              <p className="mt-1 max-w-[520px] truncate text-xs text-slate-400">
                {
                  selectedMatch
                    .asset
                    .filename
                }
              </p>
            </div>

            <span className="shrink-0 rounded-full bg-lime-300/10 px-2 py-1 text-[10px] font-bold text-lime-200">
              SCORE{" "}
              {
                selectedMatch.score
              }
            </span>
          </div>

          {reviewDecision ===
          "REMOVE" ? (
            <div className="flex min-h-[170px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/15 bg-red-300/[0.05] text-lg text-red-200">
                ×
              </div>

              <p className="mt-3 text-sm font-semibold text-slate-300">
                B-roll removed
              </p>

              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">
                Este bloque se
                mantendrá como
                talking head si
                conservas esta
                decisión.
              </p>

              <button
                type="button"
                onClick={
                  handleRestore
                }
                className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                RESTORE
              </button>
            </div>
          ) : (
            <div className="bg-black">
              {previewLoading && (
                <div className="flex min-h-[220px] items-center justify-center px-6 text-center">
                  <p className="text-xs text-slate-500">
                    Loading local
                    preview...
                  </p>
                </div>
              )}

              {!previewLoading &&
                previewError && (
                  <div className="flex min-h-[160px] items-center justify-center px-6 text-center">
                    <p className="text-xs leading-5 text-red-300/80">
                      {
                        previewError
                      }
                    </p>
                  </div>
                )}

              {!previewLoading &&
                !previewError &&
                previewUrl && (
                  <video
                    key={
                      previewUrl
                    }
                    src={
                      previewUrl
                    }
                    controls
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="mx-auto max-h-[420px] w-full bg-black object-contain"
                  />
                )}
            </div>
          )}

          {reviewDecision !==
            "REMOVE" && (
            <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] p-3">
              <button
                type="button"
                onClick={
                  handleKeep
                }
                className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                  reviewDecision ===
                  "KEEP"
                    ? "bg-lime-300 text-black"
                    : "border border-lime-300/20 bg-lime-300/[0.05] text-lime-200 hover:bg-lime-300/[0.1]"
                }`}
              >
                KEEP
              </button>

              <button
                type="button"
                onClick={
                  handleReplace
                }
                disabled={
                  !hasAlternatives
                }
                className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                  !hasAlternatives
                    ? "cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-slate-600"
                    : isReplacing
                      ? "border border-cyan-300/30 bg-cyan-300/[0.1] text-cyan-100"
                      : "border border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-300/20 hover:text-cyan-100"
                }`}
              >
                {hasAlternatives
                  ? "REPLACE"
                  : "NO ALTERNATIVES"}
              </button>

              <button
                type="button"
                onClick={
                  handleRemove
                }
                className="rounded-xl border border-red-300/15 bg-red-300/[0.03] px-3 py-2.5 text-xs font-black text-red-200 transition hover:border-red-300/30 hover:bg-red-300/[0.07]"
              >
                REMOVE
              </button>
            </div>
          )}
        </div>
      )}

      {isReplacing && (
        <div className="mb-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.025] px-3 py-3">
          <p className="text-[10px] font-bold tracking-[0.14em] text-cyan-200">
            CHOOSE
            REPLACEMENT
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Selecciona otro
            candidato para
            actualizar el preview.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {matches.map(
          (
            match,
            index
          ) => {
            const isSelected =
              selectedMatch
                ?.asset.id ===
              match.asset.id;

            const canSelect =
              isReplacing &&
              !isSelected;

            return (
              <button
                type="button"
                key={
                  match.asset.id
                }
                onClick={() => {
                  if (
                    canSelect
                  ) {
                    selectCandidate(
                      match
                        .asset
                        .id
                    );
                  }
                }}
                disabled={
                  !canSelect
                }
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  isSelected
                    ? "border-lime-300/25 bg-lime-300/[0.04]"
                    : canSelect
                      ? "cursor-pointer border-cyan-300/15 bg-cyan-300/[0.02] hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]"
                      : "border-white/[0.07] bg-black/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {index ===
                        0 && (
                        <span className="rounded-full bg-lime-300/10 px-2 py-0.5 text-[10px] font-bold text-lime-200">
                          BEST
                        </span>
                      )}

                      {isSelected && (
                        <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
                          SELECTED
                        </span>
                      )}

                      {canSelect && (
                        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-slate-400">
                          SELECT
                        </span>
                      )}

                      <span className="text-[11px] font-semibold text-slate-500">
                        SCORE{" "}
                        {
                          match.score
                        }
                      </span>
                    </div>

                    <p className="mt-2 break-all text-xs font-medium leading-5 text-slate-200">
                      {
                        match
                          .asset
                          .filename
                      }
                    </p>

                    <p className="mt-1 break-all text-[11px] leading-4 text-slate-600">
                      {
                        match
                          .asset
                          .path
                      }
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-slate-600">
                      {
                        match
                          .asset
                          .orientation
                      }
                    </p>

                    {match.asset
                      .sourceName && (
                      <p className="mt-1 text-[10px] text-slate-600">
                        {
                          match
                            .asset
                            .sourceName
                        }
                      </p>
                    )}
                  </div>
                </div>

                {match.reasons
                  .length >
                  0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {match.reasons.map(
                      (
                        reason
                      ) => (
                        <span
                          key={
                            reason
                          }
                          className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500"
                        >
                          {
                            reason
                          }
                        </span>
                      )
                    )}
                  </div>
                )}
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}