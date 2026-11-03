import type { BrollCatalog } from "@/lib/broll/types";
import type {
  MotionGraphicRequest,
  RenderMotionGraphicSegment,
} from "@/lib/motion/types";
import { buildSubtitles } from "@/lib/subtitles/buildSubtitles";
import type {
  RenderBrollSegment,
  RenderImpactSegment,
  RenderSubtitleSegment,
} from "@/lib/renderVideo";

type VisualPlanItem = {
  id: string;
  start: number;
  end: number;
  transcript: string;

  action:
    | "BROLL"
    | "IMPACT_WORD"
    | "MOTION_GRAPHIC";

  motionGraphic:
    | MotionGraphicRequest
    | null;

  impactText: string | null;
  ambientFallback?: boolean;
};

type VisualPlan = {
  duration: number;
  items: VisualPlanItem[];
};

type TranscriptionWord = {
  word: string;
  start: number;
  end: number;
};

export type BrollEngineRenderAsset = {
  assetId: string;
  filename: string;
  path: string;
};

export type BrollEngineImpactSegment =
  RenderImpactSegment & {
    impactText: string | null;
  };

export type BrollEngineRenderPlan = {
  duration: number;

  assets: BrollEngineRenderAsset[];
  ambientSegments: Array<{ start: number; end: number; variant: number }>;

  brollSegments: RenderBrollSegment[];

  subtitleSegments: RenderSubtitleSegment[];

  impactSegments: BrollEngineImpactSegment[];

  motionGraphicSegments:
    RenderMotionGraphicSegment[];
};

type BuildOptions = {
  visualPlan: VisualPlan;

  selectedBrollByItem: Record<
    string,
    string | null
  >;

  catalog: BrollCatalog;

  words: TranscriptionWord[];
};

function normalizeMotionToken(
  value: string
) {
  return value
    .toLocaleLowerCase(
      "es-MX"
    )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}

function findMotionValueRevealAt(
  value: string | null,
  words: TranscriptionWord[],
  start: number,
  end: number
) {
  if (
    !value?.trim()
  ) {
    return null;
  }

  const targetTokens =
    normalizeMotionToken(
      value
    )
      .split(
        /\s+/
      )
      .filter(Boolean);

  if (
    targetTokens.length ===
    0
  ) {
    return null;
  }

  const rangeWords =
    words
      .filter(
        (word) =>
          word.start <
            end &&
          word.end >
            start
      )
      .map(
        (word) => ({
          ...word,

          normalized:
            normalizeMotionToken(
              word.word
            ),
        })
      )
      .filter(
        (word) =>
          Boolean(
            word.normalized
          )
      );

  /*
    Primero intentamos hacer match consecutivo
    del texto completo o de sus primeras palabras.
  */
  const maxSequenceLength =
    Math.min(
      targetTokens.length,
      4
    );

  for (
    let sequenceLength =
      maxSequenceLength;
    sequenceLength >=
    1;
    sequenceLength -= 1
  ) {
    for (
      let index = 0;
      index <=
      rangeWords.length -
        sequenceLength;
      index += 1
    ) {
      let matches =
        true;

      for (
        let offset = 0;
        offset <
        sequenceLength;
        offset += 1
      ) {
        if (
          rangeWords[
            index +
              offset
          ].normalized !==
          targetTokens[
            offset
          ]
        ) {
          matches =
            false;

          break;
        }
      }

      if (matches) {
        return Math.max(
          start,
          rangeWords[
            index
          ].start
        );
      }
    }
  }

  /*
    Fallback:
    buscamos el token más distintivo del valor.
  */
  const distinctiveTokens =
    [...targetTokens]
      .sort(
        (a, b) =>
          b.length -
          a.length
      );

  for (
    const token of
    distinctiveTokens
  ) {
    if (
      token.length <
      3
    ) {
      continue;
    }

    const found =
      rangeWords.find(
        (word) =>
          word.normalized ===
          token
      );

    if (found) {
      return Math.max(
        start,
        found.start
      );
    }
  }

  return null;
}

export function buildBrollEngineRenderPlan({
  visualPlan,
  selectedBrollByItem,
  catalog,
  words,
}: BuildOptions): BrollEngineRenderPlan {
  if (
    !Number.isFinite(
      visualPlan.duration
    ) ||
    visualPlan.duration <= 0
  ) {
    throw new Error(
      "La duración del Visual Plan no es válida."
    );
  }

  if (
    !Array.isArray(
      visualPlan.items
    ) ||
    visualPlan.items.length === 0
  ) {
    throw new Error(
      "El Visual Plan no contiene segmentos."
    );
  }

  if (
    !Array.isArray(words) ||
    words.length === 0
  ) {
    throw new Error(
      "La transcripción no contiene word timestamps."
    );
  }

  /*
    ==========================================
    SAFETY CHECK — TIMELINE VISUAL COMPLETA
    ==========================================

    La cobertura ya no se valida usando solamente
    B-roll. Ahora la timeline puede estar formada por:

    BROLL
    IMPACT_WORD (B-roll + overlay)
    MOTION_GRAPHIC

    Cada item sigue siendo exclusivo y contiguo.
  */
  const sortedVisualItems =
    [...visualPlan.items]
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
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  if (
    sortedVisualItems.length !==
    visualPlan.items.length
  ) {
    throw new Error(
      "El Visual Plan contiene timestamps inválidos."
    );
  }

  const tolerance =
    0.01;

  if (
    Math.abs(
      sortedVisualItems[0]
        .start
    ) >
    tolerance
  ) {
    throw new Error(
      "La timeline de render no comienza en 0."
    );
  }

  for (
    let index = 1;
    index <
    sortedVisualItems.length;
    index += 1
  ) {
    const previous =
      sortedVisualItems[
        index - 1
      ];

    const current =
      sortedVisualItems[
        index
      ];

    if (
      Math.abs(
        current.start -
          previous.end
      ) >
      tolerance
    ) {
      throw new Error(
        "La timeline de render contiene un hueco o solapamiento."
      );
    }
  }

  const lastVisualItem =
    sortedVisualItems[
      sortedVisualItems.length -
        1
    ];

  if (
    Math.abs(
      lastVisualItem.end -
        visualPlan.duration
    ) >
    tolerance
  ) {
    throw new Error(
      "La timeline de render no cubre el final completo del audio."
    );
  }

  const brollSegments:
    RenderBrollSegment[] = [];

  const motionGraphicSegments:
    RenderMotionGraphicSegment[] =
      [];

  const ambientSegments: BrollEngineRenderPlan["ambientSegments"] = [];

  const uniqueAssets =
    new Map<
      string,
      BrollEngineRenderAsset
    >();

  for (
    const item of
    sortedVisualItems
  ) {
    if (
      item.action ===
      "MOTION_GRAPHIC"
    ) {
      if (
        !item.motionGraphic
      ) {
        throw new Error(
          `El segmento ${item.id} es MOTION_GRAPHIC pero no contiene motionGraphic.`
        );
      }

      const graphic =
        item.motionGraphic;

      const baseSegment:
        RenderMotionGraphicSegment = {
        start:
          item.start,

        end:
          item.end,

        graphic,
      };

      if (
        graphic.type ===
        "STAT_CALLOUT"
      ) {
        baseSegment.secondaryRevealAt =
          findMotionValueRevealAt(
            graphic.secondary,
            words,
            item.start,
            item.end
          );
      }

      if (
        graphic.type ===
        "COMPARISON"
      ) {
        baseSegment.secondaryRevealAt =
          findMotionValueRevealAt(
            graphic.rightTitle,
            words,
            item.start,
            item.end
          );
      }

      if (
        graphic.type ===
        "PROCESS_FLOW"
      ) {
        baseSegment.stepRevealAt =
          graphic.steps.map(
            (step) =>
              findMotionValueRevealAt(
                step.title,
                words,
                item.start,
                item.end
              )
          );
      }

      if (
        graphic.type ===
        "KEY_POINTS"
      ) {
        baseSegment.pointRevealAt =
          graphic.points.map(
            (point) =>
              findMotionValueRevealAt(
                point.title,
                words,
                item.start,
                item.end
              )
          );
      }

      motionGraphicSegments.push(
        baseSegment
      );

      continue;
    }

    /*
      BROLL e IMPACT_WORD siguen necesitando
      un asset local porque Impact es sólo overlay.
    */
    const assetId =
      selectedBrollByItem[
        item.id
      ];

    if (!assetId && item.ambientFallback) {
      ambientSegments.push({ start: item.start, end: item.end, variant: ambientSegments.length % 3 });
      continue;
    }

    if (!assetId) {
      throw new Error(
        `El segmento ${item.id} todavía no tiene B-roll seleccionado.`
      );
    }

    const asset =
      catalog.assets.find(
        (candidate) =>
          candidate.id ===
          assetId
      );

    if (!asset) {
      throw new Error(
        `El asset ${assetId} ya no existe en la biblioteca conectada.`
      );
    }

    brollSegments.push({
      assetId:
        asset.id,

      start:
        item.start,

      end:
        item.end,
    });

    uniqueAssets.set(
      asset.id,
      {
        assetId:
          asset.id,

        filename:
          asset.filename,

        path:
          asset.path,
      }
    );
  }

  /*
    Los subtítulos se construyen con exactamente
    el mismo Subtitle Engine usado por Auto Edit.
  */
  const subtitleCues =
    buildSubtitles(words);

  /*
    IMPACT_WORD sigue la misma lógica temporal
    estable de Auto Edit.
  */
  const impactSegments:
    BrollEngineImpactSegment[] =
    sortedVisualItems
      .filter(
        (item) =>
          item.action ===
          "IMPACT_WORD"
      )
      .map(
        (item) => {
          const impactWords =
            words
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
              )
              .filter(
                (word) =>
                  word.end >
                  word.start
              );

          return {
            start:
              item.start,

            end:
              item.end,

            words:
              impactWords,

            impactText:
              item.impactText,
          };
        }
      )
      .filter(
        (segment) =>
          segment.words.length >
          0
      );

  /*
    Conservamos todos los captions.
    El renderer decide qué rangos esconder durante
    IMPACT_WORD y MOTION_GRAPHIC.
  */
  const subtitleSegments:
    RenderSubtitleSegment[] =
    subtitleCues.map(
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

  return {
    ambientSegments,
    duration:
      visualPlan.duration,

    assets:
      [...uniqueAssets.values()],

    brollSegments:
      [...brollSegments].sort(
        (a, b) =>
          a.start -
          b.start
      ),

    subtitleSegments,

    impactSegments,

    motionGraphicSegments:
      [...motionGraphicSegments].sort(
        (a, b) =>
          a.start -
          b.start
      ),
  };
}
