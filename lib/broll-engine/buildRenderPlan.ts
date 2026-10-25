import type { BrollCatalog } from "@/lib/broll/types";
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
  action: "BROLL" | "IMPACT_WORD";
  impactText: string | null;
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

  brollSegments: RenderBrollSegment[];

  subtitleSegments: RenderSubtitleSegment[];

  impactSegments: BrollEngineImpactSegment[];
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

  const brollSegments:
    RenderBrollSegment[] = [];

  const uniqueAssets =
    new Map<
      string,
      BrollEngineRenderAsset
    >();

  for (
    const item of visualPlan.items
  ) {
    const assetId =
      selectedBrollByItem[
        item.id
      ];

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
    estable de Auto Edit:

    tomamos únicamente las palabras reales de Whisper
    que intersectan el rango del Visual Plan.

    impactText se conserva como metadata para el futuro
    renderer de Voice-over, pero NO inventamos timestamps
    para texto que quizá no coincida literalmente con
    lo pronunciado.
  */
  const impactSegments:
    BrollEngineImpactSegment[] =
    visualPlan.items
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
    IMPORTANTE:
    el Render Plan conserva SIEMPRE todos los subtítulos.

    Antes eliminábamos los cues que coincidían con
    IMPACT_WORD. Eso funcionaba en Auto Edit porque
    Impact Words se renderizaba al mismo tiempo, pero
    en B-Roll Engine provocaba huecos cuando el renderer
    todavía no dibujaba esos impactos.

    La responsabilidad de ocultar captions durante un
    Impact Word pertenece al renderer que realmente
    aplique ese efecto, no al builder de la timeline.
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

  /*
    Safety check del timeline visual.

    El Visual Planner ya valida cobertura,
    pero repetimos la comprobación antes de
    acercarnos a FFmpeg.
  */
  const sortedBrollSegments =
    [...brollSegments].sort(
      (a, b) =>
        a.start -
        b.start
    );

  const tolerance =
    0.01;

  if (
    Math.abs(
      sortedBrollSegments[0]
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
    sortedBrollSegments.length;
    index += 1
  ) {
    const previous =
      sortedBrollSegments[
        index - 1
      ];

    const current =
      sortedBrollSegments[
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

  const lastSegment =
    sortedBrollSegments[
      sortedBrollSegments.length -
        1
    ];

  if (
    Math.abs(
      lastSegment.end -
        visualPlan.duration
    ) >
    tolerance
  ) {
    throw new Error(
      "La timeline de render no cubre el final completo del audio."
    );
  }

  return {
    duration:
      visualPlan.duration,

    assets:
      [...uniqueAssets.values()],

    brollSegments:
      sortedBrollSegments,

    subtitleSegments,

    impactSegments,
  };
}
