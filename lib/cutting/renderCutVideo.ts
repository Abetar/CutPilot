"use client";

import { getFFmpeg } from "@/lib/extractAudio";

export type CutRenderSegment = {
  start: number;
  end: number;
};

/*
  ==========================================
  CUTTING ENGINE RENDERER V3
  ==========================================

  Problema confirmado en el render V4.2:

  El renderer anterior abría el MISMO MP4 una vez
  por cada KEEP:

  -ss START -t DURATION -i source.mp4

  Con muchos fragmentos, FFmpeg WASM podía empezar
  desde un keyframe anterior al timestamp solicitado.

  Resultado observable:
  - el Cut Plan marcaba un silencio como REMOVE;
  - el MP4 final volvía a incluir parte de ese silencio;
  - el output real duraba más que el estimado.

  V3 usa:
  - UN solo input;
  - UN solo decoder;
  - select / aselect para conservar únicamente KEEP;
  - timestamps reconstruidos para pegar los fragmentos.

  Así evitamos el pre-roll de keyframes de los seeks
  repetidos y también evitamos decenas de inputs.
*/

const CUT_MAX_WIDTH = 1080;
const CUT_OUTPUT_FPS = 30;

function normalizeSegments(
  segments: CutRenderSegment[]
) {
  const sorted = segments
    .filter(
      (segment) =>
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.start >= 0 &&
        segment.end > segment.start
    )
    .map((segment) => ({
      start: Math.max(0, segment.start),
      end: Math.max(segment.start, segment.end),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: CutRenderSegment[] = [];

  for (const segment of sorted) {
    const previous =
      merged[merged.length - 1];

    /*
      Solo fusionamos segmentos que realmente se
      tocan o solapan.

      El renderer anterior toleraba gaps de 60 ms,
      lo que podía volver a introducir pequeños
      REMOVE dentro del video.
    */
    if (
      previous &&
      segment.start <= previous.end + 0.001
    ) {
      previous.end = Math.max(
        previous.end,
        segment.end
      );

      continue;
    }

    merged.push({
      ...segment,
    });
  }

  return merged;
}

function makeOutputName(
  sourceName: string
) {
  const base = sourceName
    .replace(/\.[^/.]+$/, "")
    .replace(
      /[^a-zA-Z0-9-_]+/g,
      "-"
    )
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base || "cutpilot"}-cut.mp4`;
}

function buildSelectExpression(
  segments: CutRenderSegment[]
) {
  /*
    between(t,start,end) devuelve 1 dentro del KEEP.

    Al sumar las condiciones:
    0 = descartar
    >0 = conservar
  */
  return segments
    .map(
      (segment) =>
        `between(t,${segment.start.toFixed(6)},${segment.end.toFixed(6)})`
    )
    .join("+");
}

export async function renderCutVideo(
  sourceVideo: File,
  segments: CutRenderSegment[],
  onProgress?: (
    progress: number
  ) => void
): Promise<File> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "Cutting Engine solo puede ejecutarse en el navegador."
    );
  }

  const normalized =
    normalizeSegments(
      segments
    );

  if (
    normalized.length === 0
  ) {
    throw new Error(
      "No hay segmentos KEEP válidos para renderizar."
    );
  }

  const expectedDuration =
    normalized.reduce(
      (
        total,
        segment
      ) =>
        total +
        (
          segment.end -
          segment.start
        ),
      0
    );

  if (
    !Number.isFinite(
      expectedDuration
    ) ||
    expectedDuration <= 0
  ) {
    throw new Error(
      "La duración estimada del corte no es válida."
    );
  }

  const ffmpeg =
    await getFFmpeg();

  const { fetchFile } =
    await import(
      "@ffmpeg/util"
    );

  const renderId =
    crypto.randomUUID();

  const inputName =
    `cutpilot-cut-source-${renderId}.mp4`;

  const outputName =
    `cutpilot-cut-output-${renderId}.mp4`;

  const filesToDelete = [
    inputName,
    outputName,
  ];

  let progressHandler:
    | ((
        event: {
          progress: number;
          time?: number;
        }
      ) => void)
    | null = null;

  try {
    onProgress?.(2);

    await ffmpeg.writeFile(
      inputName,
      await fetchFile(
        sourceVideo
      )
    );

    onProgress?.(7);

    const selectExpression =
      buildSelectExpression(
        normalized
      );

    /*
      VIDEO

      1. fps=30:
         normaliza frames antes de reconstruir PTS.

      2. select:
         descarta todo lo que NO está dentro de KEEP.

      3. setpts=N/(30*TB):
         pega los frames supervivientes sin dejar
         huecos temporales entre cortes.

      4. scale:
         solo escala frames que realmente sobrevivieron.
    */
    const videoFilter =
      `[0:v]` +
      `fps=${CUT_OUTPUT_FPS},` +
      `select='${selectExpression}',` +
      `setpts=N/(${CUT_OUTPUT_FPS}*TB),` +
      `scale=w='min(${CUT_MAX_WIDTH},iw)':h=-2:flags=fast_bilinear` +
      `[outv]`;

    /*
      AUDIO

      aselect usa exactamente los mismos intervalos KEEP.

      asetpts=N/SR/TB reconstruye una línea de tiempo
      continua utilizando el número real de samples
      conservados.

      Esto evita que quede silencio únicamente porque
      existía un gap en el timestamp original.
    */
    const audioFilter =
      `[0:a]` +
      `aselect='${selectExpression}',` +
      `asetpts=N/SR/TB` +
      `[outa]`;

    const filterComplex =
      `${videoFilter};${audioFilter}`;

    progressHandler =
      ({
        progress,
        time,
      }) => {
        let ratio =
          Number.isFinite(
            progress
          )
            ? Math.max(
                0,
                Math.min(
                  1,
                  progress
                )
              )
            : 0;

        /*
          Algunas builds de FFmpeg WASM reportan
          progress relativo al input completo y no al
          output recortado.

          Si "time" viene en microsegundos podemos
          calcular una razón más útil contra la duración
          esperada del MP4 final.
        */
        if (
          typeof time ===
            "number" &&
          Number.isFinite(
            time
          ) &&
          time > 0
        ) {
          const timeSeconds =
            time >
            expectedDuration *
              100
              ? time /
                1_000_000
              : time;

          if (
            Number.isFinite(
              timeSeconds
            )
          ) {
            ratio =
              Math.max(
                ratio,
                Math.max(
                  0,
                  Math.min(
                    1,
                    timeSeconds /
                      expectedDuration
                  )
                )
              );
          }
        }

        const mapped =
          Math.round(
            8 +
              ratio *
                88
          );

        onProgress?.(
          Math.min(
            96,
            mapped
          )
        );
      };

    ffmpeg.on(
      "progress",
      progressHandler
    );

    await ffmpeg.exec([
      "-i",
      inputName,

      "-filter_complex",
      filterComplex,

      "-map",
      "[outv]",

      "-map",
      "[outa]",

      "-c:v",
      "libx264",

      "-preset",
      "ultrafast",

      "-crf",
      "23",

      "-pix_fmt",
      "yuv420p",

      "-c:a",
      "aac",

      "-b:a",
      "160k",

      "-movflags",
      "+faststart",

      "-avoid_negative_ts",
      "make_zero",

      outputName,
    ]);

    if (
      progressHandler
    ) {
      ffmpeg.off(
        "progress",
        progressHandler
      );

      progressHandler =
        null;
    }

    onProgress?.(97);

    const output =
      await ffmpeg.readFile(
        outputName
      );

    if (
      typeof output ===
      "string"
    ) {
      throw new Error(
        "FFmpeg devolvió un archivo de salida inválido."
      );
    }

    const bytes =
      new Uint8Array(
        output
      );

    const file =
      new File(
        [bytes],
        makeOutputName(
          sourceVideo.name
        ),
        {
          type:
            "video/mp4",
        }
      );

    onProgress?.(100);

    return file;
  } finally {
    if (
      progressHandler
    ) {
      try {
        ffmpeg.off(
          "progress",
          progressHandler
        );
      } catch {
        // Best effort.
      }
    }

    for (
      const fileName of
        filesToDelete
    ) {
      try {
        await ffmpeg.deleteFile(
          fileName
        );
      } catch {
        // Best effort.
      }
    }
  }
}
