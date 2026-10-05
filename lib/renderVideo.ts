import { getFFmpeg } from "@/lib/extractAudio";

export type RenderBrollInput = {
  assetId: string;
  path: string;
  file: File;
};

export type PreparedBrollInput = {
  assetId: string;
  path: string;
  inputName: string;
};

export type PreparedRenderWorkspace = {
  sourceInputName: string;

  brollInputs: PreparedBrollInput[];

  cleanup: () => Promise<void>;
};

export type RenderBrollSegment = {
  assetId: string;

  start: number;

  end: number;
};

export type RenderEffectType =
  | "SUBTLE_PUNCH_IN";

export type RenderEffectSegment = {
  type: RenderEffectType;

  start: number;

  end: number;
};

export type RenderSubtitleWord = {
  word: string;

  start: number;

  end: number;
};

export type RenderSubtitleSegment = {
  start: number;

  end: number;

  text: string;

  words?: RenderSubtitleWord[];
};

export type RenderImpactSegment = {
  start: number;

  end: number;

  words: RenderSubtitleWord[];
};

export type RenderProgressUpdate = {
  percent: number;

  phase:
    | "INITIALIZING"
    | "PREPARING"
    | "ENCODING"
    | "FINALIZING"
    | "DONE";

  message: string;
};

export type RenderVideoOptions = {
  width: number;

  height: number;

  duration: number;

  brollSegments: RenderBrollSegment[];

  /*
    Opcionales para no romper llamadas
    existentes al renderer.
  */
  effectSegments?: RenderEffectSegment[];

  subtitleSegments?: RenderSubtitleSegment[];

  impactSegments?: RenderImpactSegment[];

  onProgress?: (
    update: RenderProgressUpdate
  ) => void;
};

/*
  ==========================================
  SUBTITLE IMAGE
  ==========================================

  Los subtítulos se dibujan primero en Canvas
  y se convierten a PNG transparente.

  Esto evita depender de drawtext / fuentes
  instaladas dentro de FFmpeg WASM.
*/

/*
  ==========================================
  SUBTITLE STYLE
  ==========================================

  Ajustes globales del preset visual.

  SUBTITLE_FONT_SCALE es la variable principal
  para hacer TODOS los subtítulos más grandes
  o más pequeños.

  Ejemplos:
  0.055 = más pequeño
  0.060 = actual
  0.065 = más grande
*/

const SUBTITLE_FONT_SCALE =
  0.06;

const SUBTITLE_MIN_FONT_SCALE =
  0.048;

const SUBTITLE_FONT_WEIGHT =
  700;

const SUBTITLE_MAX_WIDTH_SCALE =
  0.76;

const SUBTITLE_VERTICAL_POSITION =
  0.69;

/*
  Escala aplicada SOLO a la palabra que se está
  pronunciando.

  1.00 = sin crecimiento
  1.06 = muy sutil
  1.08 = actual
  1.10 = más evidente
*/
const SUBTITLE_ACTIVE_WORD_SCALE =
  1.08;

/*
  Animación V2 más sutil:

  visualmente:
  1.12x → 0.985x → 1.025x → 1.00x

  La salida hace un pequeño pop a ~1.05x
  mientras desaparece.
*/
const SUBTITLE_POP_START =
  1.12;

const SUBTITLE_POP_UNDERSHOOT =
  0.985;

const SUBTITLE_POP_BOUNCE =
  1.025;

const SUBTITLE_POP_EXIT =
  1.05;


type SubtitleFilterSupport = {
  ass: boolean;
  subtitles: boolean;
  libassLikelyAvailable: boolean;
};

let subtitleFilterSupportProbe:
  | Promise<SubtitleFilterSupport>
  | null = null;

/*
  ==========================================
  ASS / LIBASS CAPABILITY PROBE
  ==========================================

  Esta prueba es deliberadamente "best effort":

  - NO modifica el pipeline estable.
  - NO usa ASS todavía.
  - NO puede cancelar el render si falla.
  - solo imprime en consola qué filtros trae
    este build concreto de FFmpeg WASM.

  Buscamos:
  - filter=ass
  - filter=subtitles

  Ambos dependen normalmente de libass.
*/
async function probeSubtitleFilterSupport(
  ffmpeg: Awaited<
    ReturnType<
      typeof getFFmpeg
    >
  >
): Promise<SubtitleFilterSupport> {
  if (
    subtitleFilterSupportProbe
  ) {
    return subtitleFilterSupportProbe;
  }

  subtitleFilterSupportProbe =
    (async () => {
      async function hasFilter(
        filterName: string
      ) {
        const messages: string[] =
          [];

        const handleLog = ({
          message,
        }: {
          message: string;
        }) => {
          if (
            typeof message ===
              "string" &&
            message.trim()
          ) {
            messages.push(
              message
            );
          }
        };

        try {
          ffmpeg.on(
            "log",
            handleLog
          );

          const exitCode =
            await ffmpeg.exec([
              "-hide_banner",
              "-h",
              `filter=${filterName}`,
            ]);

          const output =
            messages.join(
              "\n"
            );

          const explicitlyUnknown =
            /unknown filter|no such filter/i.test(
              output
            );

          const looksSupported =
            new RegExp(
              `\\b${filterName}\\b`,
              "i"
            ).test(
              output
            ) &&
            !explicitlyUnknown;

          return (
            exitCode === 0 &&
            looksSupported
          );
        } catch {
          return false;
        } finally {
          try {
            ffmpeg.off(
              "log",
              handleLog
            );
          } catch {
            // Probe only. Never affect render.
          }
        }
      }

      try {
        const ass =
          await hasFilter(
            "ass"
          );

        const subtitles =
          await hasFilter(
            "subtitles"
          );

        const support = {
          ass,
          subtitles,

          libassLikelyAvailable:
            ass ||
            subtitles,
        };

        console.info(
          "CutPilot ASS subtitle probe:",
          support
        );

        return support;
      } catch {
        const support = {
          ass: false,
          subtitles: false,
          libassLikelyAvailable:
            false,
        };

        console.info(
          "CutPilot ASS subtitle probe:",
          support
        );

        return support;
      }
    })();

  return subtitleFilterSupportProbe;
}

function pickSubtitleEmoji(
  text: string
) {
  /*
    Si el texto ya tiene emoji, no añadimos otro.
  */
  if (
    /\p{Extended_Pictographic}/u.test(
      text
    )
  ) {
    return null;
  }

  const normalized =
    text.toLocaleLowerCase(
      "es"
    );

  /*
    Máximo 1 emoji y solo cuando el contexto
    es suficientemente claro.
  */
  const emojiRules: Array<{
    emoji: string;
    pattern: RegExp;
  }> = [
    {
      emoji: "📸",
      pattern:
        /\b(c[aá]mara|camaras|foto|fotos|fotograf[ií]a|fotografias|camera|photo|photos)\b/i,
    },
    {
      emoji: "🔋",
      pattern:
        /\b(bater[ií]a|bateria|carga|cargar|charging|battery)\b/i,
    },
    {
      emoji: "💸",
      pattern:
        /\b(precio|precios|costo|costos|caro|cara|barato|barata|pagas|pagar|dinero|price|cost|expensive|cheap)\b/i,
    },
    {
      emoji: "⚠️",
      pattern:
        /\b(error|problema|problemas|riesgo|riesgos|cuidado|warning|issue|issues|risk)\b/i,
    },
    {
      emoji: "⬆️",
      pattern:
        /\b(actualizar|actualizaci[oó]n|upgrade|avance|mejora|mejorar|actualices)\b/i,
    },
    {
      emoji: "📱",
      pattern:
        /\b(iphone|smartphone|tel[eé]fono|telefono|celular|android|pixel|galaxy)\b/i,
    },
    {
      emoji: "💻",
      pattern:
        /\b(macbook|laptop|computadora|ordenador|pc)\b/i,
    },
    {
      emoji: "⌚",
      pattern:
        /\b(apple watch|smartwatch|reloj)\b/i,
    },
  ];

  for (
    const rule of
    emojiRules
  ) {
    if (
      rule.pattern.test(
        normalized
      )
    ) {
      return rule.emoji;
    }
  }

  if (
    /[?¿]/.test(
      text
    )
  ) {
    return "🤔";
  }

  return null;
}

function wrapSubtitleLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words =
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const lines: string[] = [];

  let currentLine =
    "";

  for (const word of words) {
    const candidate =
      currentLine
        ? `${currentLine} ${word}`
        : word;

    if (
      context.measureText(
        candidate
      ).width <=
        maxWidth ||
      currentLine.length === 0
    ) {
      currentLine =
        candidate;

      continue;
    }

    lines.push(
      currentLine
    );

    currentLine =
      word;
  }

  if (currentLine) {
    lines.push(
      currentLine
    );
  }

  return lines;
}

function normalizeSubtitleWord(
  value: string
) {
  return value
    .toLocaleLowerCase("es")
    .replace(
      /[^\p{L}\p{N}]+/gu,
      ""
    );
}

function pickSubtitleAccentWord(
  text: string
) {
  const words =
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const stopWords =
    new Set([
      "a",
      "al",
      "algo",
      "como",
      "con",
      "cuando",
      "de",
      "del",
      "el",
      "ella",
      "en",
      "es",
      "esta",
      "este",
      "la",
      "las",
      "lo",
      "los",
      "más",
      "me",
      "mi",
      "mucho",
      "muy",
      "no",
      "o",
      "para",
      "pero",
      "por",
      "que",
      "se",
      "si",
      "sin",
      "su",
      "te",
      "tu",
      "un",
      "una",
      "uno",
      "y",
      "ya",
      "the",
      "and",
      "or",
      "but",
      "for",
      "from",
      "of",
      "to",
      "with",
      "is",
      "are",
      "was",
      "were",
      "this",
      "that",
      "versus",
      "vs",
    ]);

  let bestWord =
    "";

  let bestScore =
    -Infinity;

  for (const word of words) {
    const normalized =
      normalizeSubtitleWord(
        word
      );

    if (
      !normalized ||
      stopWords.has(
        normalized
      )
    ) {
      continue;
    }

    let score =
      normalized.length;

    /*
      Números, modelos y palabras con mezcla
      de mayúsculas/minúsculas suelen ser
      visualmente relevantes en contenido tech.
    */
    if (/\d/.test(word)) {
      score +=
        8;
    }

    if (
      /[a-záéíóúñ][A-ZÁÉÍÓÚÑ]/.test(
        word
      )
    ) {
      score +=
        4;
    }

    if (
      score >
      bestScore
    ) {
      bestScore =
        score;

      bestWord =
        normalized;
    }
  }

  return bestWord;
}

async function createSubtitlePng(
  width: number,
  height: number,
  text: string,
  options: {
    highlightedWordIndex?: number | null;
    disableSemanticAccent?: boolean;
  } = {}
): Promise<Uint8Array> {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext(
      "2d"
    );

  if (!context) {
    throw new Error(
      "No se pudo crear el canvas de subtítulos."
    );
  }

  const highlightedWordIndex =
    options.highlightedWordIndex ??
    null;

  const disableSemanticAccent =
    options.disableSemanticAccent ??
    false;

  const emoji =
    pickSubtitleEmoji(
      text
    );

  /*
    V3 visual:
    los subtítulos se muestran siempre en MAYÚSCULAS.

    Conservamos `text` original para:
    - detección de emoji
    - selección de palabra accent
    - lógica semántica

    Solo transformamos lo que se dibuja.
  */
  const uppercaseText =
    text.toLocaleUpperCase(
      "es-MX"
    );

  const displayText =
    emoji
      ? `${uppercaseText} ${emoji}`
      : uppercaseText;

  /*
    Look V2 de CutPilot:

    - tipografía más delgada y legible
    - tamaño global configurable
    - bloque compacto
    - centro-bajo
    - blanco + una palabra lime
    - emoji contextual opcional
    - borde negro fino
    - sombra negra visible
  */
  const maxTextWidth =
    width *
    SUBTITLE_MAX_WIDTH_SCALE;

  const initialFontSize =
    Math.max(
      32,
      Math.round(
        width *
          SUBTITLE_FONT_SCALE
      )
    );

  const minimumFontSize =
    Math.max(
      24,
      Math.round(
        width *
          SUBTITLE_MIN_FONT_SCALE
      )
    );

  const fontFamily =
    `Arial, Helvetica, "Segoe UI Emoji", sans-serif`;

  let fontSize =
    initialFontSize;

  let lines: string[] =
    [];

  while (
    fontSize >=
      minimumFontSize
  ) {
    context.font =
      `${SUBTITLE_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;

    lines =
      wrapSubtitleLines(
        context,
        displayText,
        maxTextWidth
      );

    if (
      lines.length <= 2
    ) {
      break;
    }

    fontSize -=
      2;
  }

  if (
    lines.length > 2
  ) {
    const firstLine =
      lines[0];

    const secondLine =
      lines
        .slice(1)
        .join(" ");

    lines = [
      firstLine,
      secondLine,
    ];
  }

  const lineHeight =
    fontSize * 1.08;

  const centerY =
    height *
    SUBTITLE_VERTICAL_POSITION;

  const totalHeight =
    lines.length *
    lineHeight;

  const firstLineY =
    centerY -
    totalHeight / 2 +
    lineHeight / 2;

  /*
    Elegimos la palabra acentuada usando el
    texto original, no el emoji añadido.
  */
  const accentWord =
    disableSemanticAccent
      ? ""
      : pickSubtitleAccentWord(
          text
        );

  let accentRendered =
    false;

  let visibleWordIndex =
    0;

  context.textAlign =
    "left";

  context.textBaseline =
    "middle";

  context.lineJoin =
    "round";

  context.font =
    `${SUBTITLE_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;

  /*
    Contorno más fino para que el texto deje
    de sentirse tipo meme/gaming.
  */
  context.strokeStyle =
    "rgba(0, 0, 0, 0.74)";

  context.lineWidth =
    Math.max(
      2.5,
      fontSize * 0.055
    );

  /*
    Sombra suficiente para conservar legibilidad
    sobre fondos claros sin dominar el texto.
  */
  context.shadowColor =
    "rgba(0, 0, 0, 0.88)";

  context.shadowBlur =
    Math.max(
      7,
      fontSize * 0.15
    );

  context.shadowOffsetX =
    0;

  context.shadowOffsetY =
    Math.max(
      3,
      fontSize * 0.05
    );

  lines.forEach(
    (
      line,
      lineIndex
    ) => {
      const y =
        firstLineY +
        lineIndex *
          lineHeight;

      const lineWords =
        line
          .split(/\s+/)
          .filter(Boolean);

      const lineWidth =
        context.measureText(
          line
        ).width;

      let x =
        width / 2 -
        lineWidth / 2;

      lineWords.forEach(
        (
          word,
          wordIndex
        ) => {
          const hasTrailingSpace =
            wordIndex <
            lineWords.length - 1;

          const measuredToken =
            hasTrailingSpace
              ? `${word} `
              : word;

          const tokenWidth =
            context.measureText(
              measuredToken
            ).width;

          const normalized =
            normalizeSubtitleWord(
              word
            );

          const isEmoji =
            /\p{Extended_Pictographic}/u.test(
              word
            );

          const spokenWordIndex =
            isEmoji
              ? null
              : visibleWordIndex;

          const isTimedHighlight =
            spokenWordIndex !==
              null &&
            highlightedWordIndex !==
              null &&
            spokenWordIndex ===
              highlightedWordIndex;

          const isAccent =
            highlightedWordIndex ===
              null &&
            !accentRendered &&
            Boolean(
              accentWord
            ) &&
            normalized ===
              accentWord;

          context.fillStyle =
            isTimedHighlight ||
            isAccent
              ? "#bef264"
              : "#ffffff";

          /*
            La palabra activa hace un pequeño "pop"
            de tamaño SIN cambiar el layout del cue.

            Importante:
            seguimos avanzando `x` usando tokenWidth
            del tamaño normal. Así las demás palabras
            no brincan ni se reacomodan mientras hablas.
          */
          if (
            isTimedHighlight &&
            !isEmoji
          ) {
            const wordWidth =
              context.measureText(
                word
              ).width;

            const centerX =
              x +
              wordWidth / 2;

            context.save();

            context.translate(
              centerX,
              y
            );

            context.scale(
              SUBTITLE_ACTIVE_WORD_SCALE,
              SUBTITLE_ACTIVE_WORD_SCALE
            );

            context.strokeText(
              word,
              -wordWidth / 2,
              0
            );

            context.fillText(
              word,
              -wordWidth / 2,
              0
            );

            context.restore();
          } else {
            /*
              Para emojis evitamos el stroke fuerte,
              porque algunos emoji color se ven peor
              con contorno negro encima.
            */
            if (!isEmoji) {
              context.strokeText(
                word,
                x,
                y
              );
            }

            context.fillText(
              word,
              x,
              y
            );
          }

          if (isAccent) {
            accentRendered =
              true;
          }

          if (!isEmoji) {
            visibleWordIndex +=
              1;
          }

          x +=
            tokenWidth;
        }
      );
    }
  );

  const blob =
    await new Promise<Blob>(
      (
        resolve,
        reject
      ) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(
                new Error(
                  "No se pudo generar la imagen del subtítulo."
                )
              );

              return;
            }

            resolve(
              result
            );
          },
          "image/png"
        );
      }
    );

  return new Uint8Array(
    await blob.arrayBuffer()
  );
}


async function createTransparentSubtitlePng(
  width: number,
  height: number
): Promise<Uint8Array> {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const blob =
    await new Promise<Blob>(
      (
        resolve,
        reject
      ) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(
                new Error(
                  "No se pudo generar el frame transparente de subtítulos."
                )
              );

              return;
            }

            resolve(
              result
            );
          },
          "image/png"
        );
      }
    );

  return new Uint8Array(
    await blob.arrayBuffer()
  );
}


async function createImpactWordPng(
  width: number,
  height: number,
  word: string | null
): Promise<Uint8Array> {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext(
      "2d"
    );

  if (!context) {
    throw new Error(
      "No se pudo crear el canvas del efecto Impact Words."
    );
  }

  /*
    Overlay oscuro pero todavía transparente:
    el video/B-roll sigue siendo perceptible detrás.
  */
  context.fillStyle =
    "rgba(0, 0, 0, 0.64)";

  context.fillRect(
    0,
    0,
    width,
    height
  );

  if (
    word &&
    word.trim()
  ) {
    const displayWord =
      word
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        );

    const maxWidth =
      width * 0.82;

    let fontSize =
      Math.max(
        54,
        Math.round(
          width * 0.14
        )
      );

    const minFontSize =
      Math.max(
        40,
        Math.round(
          width * 0.075
        )
      );

    const fontFamily =
      `Arial, Helvetica, "Segoe UI Emoji", sans-serif`;

    while (
      fontSize >
        minFontSize
    ) {
      context.font =
        `900 ${fontSize}px ${fontFamily}`;

      if (
        context.measureText(
          displayWord
        ).width <=
        maxWidth
      ) {
        break;
      }

      fontSize -=
        4;
    }

    const centerX =
      width / 2;

    const centerY =
      height / 2;

    /*
      Halo muy suave detrás de la palabra.
      El brillo se mueve "palabra por palabra"
      porque cada estado del timeline contiene
      únicamente la palabra que se está diciendo.
    */
    const glow =
      context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        Math.max(
          width * 0.18,
          fontSize * 1.8
        )
      );

    glow.addColorStop(
      0,
      "rgba(190, 242, 100, 0.12)"
    );

    glow.addColorStop(
      1,
      "rgba(190, 242, 100, 0)"
    );

    context.fillStyle =
      glow;

    context.fillRect(
      0,
      0,
      width,
      height
    );

    context.font =
      `900 ${fontSize}px ${fontFamily}`;

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.lineJoin =
      "round";

    context.strokeStyle =
      "rgba(0, 0, 0, 0.72)";

    context.lineWidth =
      Math.max(
        3,
        fontSize * 0.045
      );

    context.shadowColor =
      "rgba(220, 255, 160, 0.55)";

    context.shadowBlur =
      Math.max(
        14,
        fontSize * 0.16
      );

    /*
      Gradiente blanco → lime muy ligero → blanco.
      Se siente más como destello que como texto verde.
    */
    const textGradient =
      context.createLinearGradient(
        centerX -
          maxWidth / 2,
        centerY,
        centerX +
          maxWidth / 2,
        centerY
      );

    textGradient.addColorStop(
      0,
      "#ffffff"
    );

    textGradient.addColorStop(
      0.5,
      "#e8ffc2"
    );

    textGradient.addColorStop(
      1,
      "#ffffff"
    );

    context.fillStyle =
      textGradient;

    context.strokeText(
      displayWord,
      centerX,
      centerY
    );

    context.fillText(
      displayWord,
      centerX,
      centerY
    );
  }

  const blob =
    await new Promise<Blob>(
      (
        resolve,
        reject
      ) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(
                new Error(
                  "No se pudo generar el PNG de Impact Words."
                )
              );

              return;
            }

            resolve(
              result
            );
          },
          "image/png"
        );
      }
    );

  return new Uint8Array(
    await blob.arrayBuffer()
  );
}

function createCameraClickTrackWav(
  duration: number,
  clickTimes: number[]
): Uint8Array {
  const sampleRate =
    44100;

  const channelCount =
    1;

  const safeDuration =
    Math.max(
      0.1,
      duration
    );

  const totalSamples =
    Math.ceil(
      safeDuration *
        sampleRate
    );

  const samples =
    new Float32Array(
      totalSamples
    );

  /*
    PRNG determinista para que el click suene igual
    en cada render y no dependamos de assets externos.
  */
  let seed =
    0x1f123bb5;

  const randomSigned =
    () => {
      seed =
        (
          Math.imul(
            seed,
            1664525
          ) +
          1013904223
        ) >>> 0;

      return (
        seed /
        0xffffffff
      ) *
        2 -
        1;
    };

  const addBurst = (
    absoluteTime: number,
    burstDuration: number,
    amplitude: number,
    frequency: number
  ) => {
    const startSample =
      Math.max(
        0,
        Math.floor(
          absoluteTime *
            sampleRate
        )
      );

    const burstSamples =
      Math.floor(
        burstDuration *
          sampleRate
      );

    for (
      let index = 0;
      index <
      burstSamples;
      index += 1
    ) {
      const sampleIndex =
        startSample +
        index;

      if (
        sampleIndex >=
        totalSamples
      ) {
        break;
      }

      const t =
        index /
        sampleRate;

      const decay =
        Math.exp(
          -t * 48
        );

      const metallic =
        Math.sin(
          2 *
            Math.PI *
            frequency *
            t
        );

      const noise =
        randomSigned();

      samples[
        sampleIndex
      ] +=
        amplitude *
        decay *
        (
          metallic *
            0.58 +
          noise *
            0.42
        );
    }
  };

  const uniqueTimes =
    [...clickTimes]
      .filter(
        (time) =>
          Number.isFinite(
            time
          ) &&
          time >= 0 &&
          time <
            safeDuration
      )
      .sort(
        (a, b) =>
          a - b
      )
      .filter(
        (
          time,
          index,
          values
        ) =>
          index === 0 ||
          time -
            values[
              index - 1
            ] >
            0.025
      );

  for (
    const time of
      uniqueTimes
  ) {
    /*
      Dos transientes:
      "clack" + cierre rápido de obturador.
    */
    addBurst(
      time,
      0.055,
      0.48,
      2450
    );

    addBurst(
      time + 0.052,
      0.038,
      0.30,
      1750
    );
  }

  /*
    Limitador muy simple.
  */
  for (
    let index = 0;
    index <
    samples.length;
    index += 1
  ) {
    samples[index] =
      Math.max(
        -0.92,
        Math.min(
          0.92,
          samples[index]
        )
      );
  }

  const bytesPerSample =
    2;

  const dataSize =
    totalSamples *
    channelCount *
    bytesPerSample;

  const buffer =
    new ArrayBuffer(
      44 +
        dataSize
    );

  const view =
    new DataView(
      buffer
    );

  const writeText = (
    offset: number,
    value: string
  ) => {
    for (
      let index = 0;
      index <
      value.length;
      index += 1
    ) {
      view.setUint8(
        offset +
          index,
        value.charCodeAt(
          index
        )
      );
    }
  };

  writeText(
    0,
    "RIFF"
  );

  view.setUint32(
    4,
    36 +
      dataSize,
    true
  );

  writeText(
    8,
    "WAVE"
  );

  writeText(
    12,
    "fmt "
  );

  view.setUint32(
    16,
    16,
    true
  );

  view.setUint16(
    20,
    1,
    true
  );

  view.setUint16(
    22,
    channelCount,
    true
  );

  view.setUint32(
    24,
    sampleRate,
    true
  );

  view.setUint32(
    28,
    sampleRate *
      channelCount *
      bytesPerSample,
    true
  );

  view.setUint16(
    32,
    channelCount *
      bytesPerSample,
    true
  );

  view.setUint16(
    34,
    16,
    true
  );

  writeText(
    36,
    "data"
  );

  view.setUint32(
    40,
    dataSize,
    true
  );

  let offset =
    44;

  for (
    let index = 0;
    index <
    samples.length;
    index += 1
  ) {
    view.setInt16(
      offset,
      Math.round(
        samples[index] *
          32767
      ),
      true
    );

    offset +=
      2;
  }

  return new Uint8Array(
    buffer
  );
}



/*
  ==========================================
  PREPARE RENDER WORKSPACE
  ==========================================

  Carga dentro del filesystem virtual
  de FFmpeg:

  - video original
  - B-roll seleccionados
*/
export async function prepareRenderWorkspace(
  sourceVideo: File,
  brollInputs: RenderBrollInput[]
): Promise<PreparedRenderWorkspace> {
  if (typeof window === "undefined") {
    throw new Error(
      "El renderer de CutPilot solo puede ejecutarse en el navegador."
    );
  }

  const ffmpeg =
    await getFFmpeg();

  const { fetchFile } =
    await import(
      "@ffmpeg/util"
    );

  const workspaceId =
    crypto.randomUUID();

  const sourceInputName =
    `cutpilot-render-source-${workspaceId}.mp4`;

  const preparedBrollInputs: PreparedBrollInput[] =
    [];

  const filesToDelete: string[] =
    [];

  try {
    /*
      ======================================
      VIDEO ORIGINAL
      ======================================
    */

    await ffmpeg.writeFile(
      sourceInputName,
      await fetchFile(
        sourceVideo
      )
    );

    filesToDelete.push(
      sourceInputName
    );

    /*
      ======================================
      B-ROLL
      ======================================
    */

    for (
      let index = 0;
      index <
      brollInputs.length;
      index += 1
    ) {
      const broll =
        brollInputs[index];

      const inputName =
        `cutpilot-broll-${index}-${workspaceId}.mp4`;

      await ffmpeg.writeFile(
        inputName,
        await fetchFile(
          broll.file
        )
      );

      filesToDelete.push(
        inputName
      );

      preparedBrollInputs.push({
        assetId:
          broll.assetId,

        path:
          broll.path,

        inputName,
      });
    }

    async function cleanup() {
      for (
        const fileName of
          filesToDelete
      ) {
        try {
          await ffmpeg.deleteFile(
            fileName
          );
        } catch {
          // Cleanup best effort.
        }
      }
    }

    return {
      sourceInputName,

      brollInputs:
        preparedBrollInputs,

      cleanup,
    };
  } catch (error) {
    for (
      const fileName of
        filesToDelete
    ) {
      try {
        await ffmpeg.deleteFile(
          fileName
        );
      } catch {
        // Cleanup best effort.
      }
    }

    throw error;
  }
}

/*
  ==========================================
  RENDER VIDEO
  ==========================================

  Soporte actual:

  - talking head original
  - audio original
  - B-roll por timestamps
  - SUBTLE_PUNCH_IN
  - subtítulos con highlight + pop por palabra
  - IMPACT WORDS opcional en KEY_STATEMENT
  - click de cámara por palabra durante IMPACT WORDS
  - MP4 H.264

  Todavía NO aplica:

  - text overlays
  - KEY_STATEMENT visual
  - PRICE
  - COMPARISON
  - QUESTION
  - PRODUCT_NAME
*/
export async function renderVideoFromWorkspace(
  workspace: PreparedRenderWorkspace,
  options: RenderVideoOptions
): Promise<File> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "El render de CutPilot solo puede ejecutarse en el navegador."
    );
  }

  if (
    !Number.isFinite(
      options.width
    ) ||
    options.width <= 0
  ) {
    throw new Error(
      "El ancho de salida no es válido."
    );
  }

  if (
    !Number.isFinite(
      options.height
    ) ||
    options.height <= 0
  ) {
    throw new Error(
      "La altura de salida no es válida."
    );
  }

  if (
    !Number.isFinite(
      options.duration
    ) ||
    options.duration <= 0
  ) {
    throw new Error(
      "La duración del video no es válida."
    );
  }

  const reportProgress = (
    percent: number,
    phase: RenderProgressUpdate["phase"],
    message: string
  ) => {
    const safePercent =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(percent)
        )
      );

    options.onProgress?.({
      percent: safePercent,
      phase,
      message,
    });
  };

  reportProgress(
    2,
    "INITIALIZING",
    "Inicializando motor de render..."
  );

  const ffmpeg =
    await getFFmpeg();

  /*
    Diagnóstico único por sesión.
    Aunque el probe falle, internamente devuelve false
    y el render Canvas/PNG continúa exactamente igual.
  */
  await probeSubtitleFilterSupport(
    ffmpeg
  );

  reportProgress(
    5,
    "PREPARING",
    "Preparando capas y timeline..."
  );

  const renderId =
    crypto.randomUUID();

  const outputName =
    `cutpilot-render-${renderId}.mp4`;

  /*
    ======================================
    NORMALIZAR B-ROLL
    ======================================
  */

  const brollSegments =
    options.brollSegments
      .filter(
        (segment) =>
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >=
            0 &&
          segment.end >
            segment.start &&
          segment.start <
            options.duration
      )
      .map(
        (segment) => ({
          ...segment,

          end: Math.min(
            segment.end,
            options.duration
          ),
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  /*
    ======================================
    NORMALIZAR EFECTOS
    ======================================
  */

  const effectSegments =
    (
      options.effectSegments ??
      []
    )
      .filter(
        (segment) =>
          segment.type ===
            "SUBTLE_PUNCH_IN" &&
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >=
            0 &&
          segment.end >
            segment.start &&
          segment.start <
            options.duration
      )
      .map(
        (segment) => ({
          ...segment,

          end: Math.min(
            segment.end,
            options.duration
          ),
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  /*
    ======================================
    NORMALIZAR IMPACT WORDS
    ======================================
  */

  const impactSegments =
    (
      options.impactSegments ??
      []
    )
      .filter(
        (segment) =>
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >=
            0 &&
          segment.end >
            segment.start &&
          segment.start <
            options.duration &&
          Array.isArray(
            segment.words
          ) &&
          segment.words.length >
            0
      )
      .map(
        (segment) => ({
          ...segment,

          end:
            Math.min(
              segment.end,
              options.duration
            ),

          words:
            segment.words
              .filter(
                (word) =>
                  typeof word.word ===
                    "string" &&
                  word.word.trim().length >
                    0 &&
                  Number.isFinite(
                    word.start
                  ) &&
                  Number.isFinite(
                    word.end
                  )
              )
              .map(
                (word) => ({
                  word:
                    word.word.trim(),

                  start:
                    Math.max(
                      segment.start,
                      word.start
                    ),

                  end:
                    Math.min(
                      segment.end,
                      Math.max(
                        word.start,
                        word.end
                      )
                    ),
                })
              ),
        })
      )
      .filter(
        (segment) =>
          segment.words.length >
            0
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  /*
    ======================================
    NORMALIZAR SUBTÍTULOS
    ======================================
  */

  const subtitleSegments =
    (
      options.subtitleSegments ??
      []
    )
      .filter(
        (segment) =>
          typeof segment.text ===
            "string" &&
          segment.text.trim().length >
            0 &&
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >=
            0 &&
          segment.end >
            segment.start &&
          segment.start <
            options.duration
      )
      .map(
        (segment) => ({
          ...segment,

          text:
            segment.text.trim(),

          end:
            Math.min(
              segment.end,
              options.duration
            ),

          words:
            (
              segment.words ??
              []
            )
              .filter(
                (word) =>
                  typeof word.word ===
                    "string" &&
                  word.word.trim().length >
                    0 &&
                  Number.isFinite(
                    word.start
                  ) &&
                  Number.isFinite(
                    word.end
                  )
              )
              .map(
                (word) => ({
                  word:
                    word.word.trim(),

                  start:
                    Math.max(
                      segment.start,
                      word.start
                    ),

                  end:
                    Math.min(
                      segment.end,
                      Math.max(
                        word.start,
                        word.end
                      )
                    ),
                })
              ),
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  /*
    ======================================
    RESOLVER INPUTS B-ROLL
    ======================================
  */

  const usedBrollInputs: PreparedBrollInput[] =
    [];

  const inputIndexByAsset =
    new Map<
      string,
      number
    >();

  for (
    const segment of
      brollSegments
  ) {
    if (
      inputIndexByAsset.has(
        segment.assetId
      )
    ) {
      continue;
    }

    const preparedInput =
      workspace.brollInputs.find(
        (input) =>
          input.assetId ===
          segment.assetId
      );

    if (!preparedInput) {
      throw new Error(
        `No se encontró el B-roll ${segment.assetId} dentro del workspace.`
      );
    }

    usedBrollInputs.push(
      preparedInput
    );

    /*
      Input 0 = video original.

      B-roll:
      input 1
      input 2
      etc.
    */
    inputIndexByAsset.set(
      segment.assetId,
      usedBrollInputs.length
    );
  }

  /*
    ======================================
    INPUTS FFMPEG
    ======================================
  */

  const args: string[] = [
    "-i",
    workspace.sourceInputName,
  ];

  for (
    const broll of
      usedBrollInputs
  ) {
    args.push(
      "-stream_loop",
      "-1",

      "-i",
      broll.inputName
    );
  }

  let nextAuxInputIndex =
    1 +
    usedBrollInputs.length;

  reportProgress(
    9,
    "PREPARING",
    "Preparando subtítulos..."
  );

  /*
    ======================================
    INPUT SUBTÍTULOS — TIMELINE CONCAT
    ======================================

    ASS quedó descartado para este build:
    el filtro existe, pero sus drawings no aparecen.

    Nueva arquitectura:

    - Canvas genera un PNG por ESTADO visual:
      palabra 1 lime, palabra 2 lime, etc.
    - los PNG NO se agregan como inputs simultáneos
    - FFmpeg los lee secuencialmente mediante UN SOLO
      concat demuxer
    - después hacemos UN SOLO overlay de subtítulos

    Esto evita los dos problemas anteriores:
    - decenas de inputs simultáneos
    - filtergraphs enormes con overlays por palabra
  */

  const subtitleFilesToDelete: string[] =
    [];

  let subtitleTimelineInputIndex:
    | number
    | null = null;

  if (
    subtitleSegments.length >
    0
  ) {
    const width =
      Math.round(
        options.width
      );

    const height =
      Math.round(
        options.height
      );

    const blankName =
      `cutpilot-subtitle-blank-${renderId}.png`;

    const blankPng =
      await createTransparentSubtitlePng(
        width,
        height
      );

    await ffmpeg.writeFile(
      blankName,
      blankPng
    );

    subtitleFilesToDelete.push(
      blankName
    );

    type TimelineFrame = {
      fileName: string;
      duration: number;
    };

    const timelineFrames: TimelineFrame[] =
      [];

    let cursor =
      0;

    const addFrame = (
      fileName: string,
      duration: number
    ) => {
      if (
        !Number.isFinite(
          duration
        ) ||
        duration <=
          0.001
      ) {
        return;
      }

      timelineFrames.push({
        fileName,
        duration,
      });
    };

    for (
      let cueIndex = 0;
      cueIndex <
      subtitleSegments.length;
      cueIndex += 1
    ) {
      const subtitle =
        subtitleSegments[
          cueIndex
        ];

      if (
        subtitle.start >
        cursor +
          0.001
      ) {
        addFrame(
          blankName,
          subtitle.start -
            cursor
        );
      }

      const words =
        subtitle.words ??
        [];

      if (
        words.length ===
        0
      ) {
        const fileName =
          `cutpilot-subtitle-${cueIndex}-base-${renderId}.png`;

        const pngData =
          await createSubtitlePng(
            width,
            height,
            subtitle.text
          );

        await ffmpeg.writeFile(
          fileName,
          pngData
        );

        subtitleFilesToDelete.push(
          fileName
        );

        addFrame(
          fileName,
          subtitle.end -
            subtitle.start
        );

        cursor =
          subtitle.end;

        continue;
      }

      /*
        Si el primer word timestamp empieza ligeramente
        después del cue, mostramos el cue blanco primero.
      */
      const firstWordStart =
        Math.max(
          subtitle.start,
          words[0].start
        );

      if (
        firstWordStart >
        subtitle.start +
          0.001
      ) {
        const baseName =
          `cutpilot-subtitle-${cueIndex}-pre-${renderId}.png`;

        const basePng =
          await createSubtitlePng(
            width,
            height,
            subtitle.text,
            {
              disableSemanticAccent:
                true,
            }
          );

        await ffmpeg.writeFile(
          baseName,
          basePng
        );

        subtitleFilesToDelete.push(
          baseName
        );

        addFrame(
          baseName,
          firstWordStart -
            subtitle.start
        );
      }

      for (
        let wordIndex = 0;
        wordIndex <
        words.length;
        wordIndex += 1
      ) {
        const word =
          words[wordIndex];

        const nextWord =
          words[
            wordIndex + 1
          ];

        const stateStart =
          Math.max(
            subtitle.start,
            word.start
          );

        const stateEnd =
          Math.min(
            subtitle.end,
            nextWord
              ? Math.max(
                  stateStart +
                    0.04,
                  nextWord.start
                )
              : subtitle.end
          );

        if (
          stateEnd <=
          stateStart
        ) {
          continue;
        }

        const fileName =
          `cutpilot-subtitle-${cueIndex}-word-${wordIndex}-${renderId}.png`;

        const pngData =
          await createSubtitlePng(
            width,
            height,
            subtitle.text,
            {
              highlightedWordIndex:
                wordIndex,

              disableSemanticAccent:
                true,
            }
          );

        await ffmpeg.writeFile(
          fileName,
          pngData
        );

        subtitleFilesToDelete.push(
          fileName
        );

        addFrame(
          fileName,
          stateEnd -
            stateStart
        );
      }

      cursor =
        subtitle.end;
    }

    if (
      cursor <
      options.duration -
        0.001
    ) {
      addFrame(
        blankName,
        options.duration -
          cursor
      );
    }

    /*
      concat demuxer ignora la duración del último
      elemento si no hay un siguiente packet.

      Duplicamos el último archivo al final para que
      sí respete la última duración.
    */
    if (
      timelineFrames.length >
      0
    ) {
      const concatName =
        `cutpilot-subtitle-timeline-${renderId}.ffconcat`;

      const concatLines: string[] =
        [
          "ffconcat version 1.0",
        ];

      for (
        const frame of
        timelineFrames
      ) {
        concatLines.push(
          `file '${frame.fileName}'`
        );

        concatLines.push(
          `duration ${Math.max(
            0.001,
            frame.duration
          ).toFixed(6)}`
        );
      }

      concatLines.push(
        `file '${timelineFrames[
          timelineFrames.length -
            1
        ].fileName}'`
      );

      await ffmpeg.writeFile(
        concatName,
        new TextEncoder().encode(
          concatLines.join(
            "\n"
          )
        )
      );

      subtitleFilesToDelete.push(
        concatName
      );

      subtitleTimelineInputIndex =
        nextAuxInputIndex;

      nextAuxInputIndex +=
        1;

      args.push(
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        concatName
      );
    }
  }

  reportProgress(
    16,
    "PREPARING",
    "Preparando efectos visuales..."
  );

  /*
    ======================================
    INPUT IMPACT WORDS
    ======================================

    Igual que los subtítulos karaoke:
    todos los estados se leen como UN solo input
    secuencial mediante concat.

    Fuera de los segmentos:
    PNG transparente.

    Dentro:
    overlay oscuro + una palabra grande al centro.
  */

  let impactTimelineInputIndex:
    | number
    | null = null;

  let cameraClickInputIndex:
    | number
    | null = null;

  if (
    impactSegments.length >
    0
  ) {
    const width =
      Math.round(
        options.width
      );

    const height =
      Math.round(
        options.height
      );

    const impactBlankName =
      `cutpilot-impact-blank-${renderId}.png`;

    const impactBlank =
      await createTransparentSubtitlePng(
        width,
        height
      );

    await ffmpeg.writeFile(
      impactBlankName,
      impactBlank
    );

    subtitleFilesToDelete.push(
      impactBlankName
    );

    const impactDarkName =
      `cutpilot-impact-dark-${renderId}.png`;

    const impactDark =
      await createImpactWordPng(
        width,
        height,
        null
      );

    await ffmpeg.writeFile(
      impactDarkName,
      impactDark
    );

    subtitleFilesToDelete.push(
      impactDarkName
    );

    type ImpactTimelineFrame = {
      fileName: string;
      duration: number;
    };

    const impactFrames: ImpactTimelineFrame[] =
      [];

    const addImpactFrame = (
      fileName: string,
      duration: number
    ) => {
      if (
        !Number.isFinite(
          duration
        ) ||
        duration <=
          0.001
      ) {
        return;
      }

      impactFrames.push({
        fileName,
        duration,
      });
    };

    let impactCursor =
      0;

    const cameraClickTimes: number[] =
      [];

    for (
      let segmentIndex = 0;
      segmentIndex <
      impactSegments.length;
      segmentIndex += 1
    ) {
      const segment =
        impactSegments[
          segmentIndex
        ];

      const segmentStart =
        Math.max(
          impactCursor,
          segment.start
        );

      if (
        segmentStart >
        impactCursor +
          0.001
      ) {
        addImpactFrame(
          impactBlankName,
          segmentStart -
            impactCursor
        );
      }

      const words =
        segment.words.filter(
          (word) =>
            word.start <
              segment.end &&
            word.end >
              segmentStart
        );

      if (
        words.length ===
        0
      ) {
        addImpactFrame(
          impactDarkName,
          segment.end -
            segmentStart
        );

        impactCursor =
          segment.end;

        continue;
      }

      const firstWordStart =
        Math.max(
          segmentStart,
          words[0].start
        );

      if (
        firstWordStart >
        segmentStart +
          0.001
      ) {
        addImpactFrame(
          impactDarkName,
          firstWordStart -
            segmentStart
        );
      }

      for (
        let wordIndex = 0;
        wordIndex <
        words.length;
        wordIndex += 1
      ) {
        const word =
          words[
            wordIndex
          ];

        const nextWord =
          words[
            wordIndex +
              1
          ];

        const stateStart =
          Math.max(
            segmentStart,
            word.start
          );

        const stateEnd =
          Math.min(
            segment.end,
            nextWord
              ? Math.max(
                  stateStart +
                    0.04,
                  nextWord.start
                )
              : segment.end
          );

        if (
          stateEnd <=
          stateStart
        ) {
          continue;
        }

        const impactWordName =
          `cutpilot-impact-${segmentIndex}-word-${wordIndex}-${renderId}.png`;

        const impactWordPng =
          await createImpactWordPng(
            width,
            height,
            word.word
          );

        await ffmpeg.writeFile(
          impactWordName,
          impactWordPng
        );

        subtitleFilesToDelete.push(
          impactWordName
        );

        addImpactFrame(
          impactWordName,
          stateEnd -
            stateStart
        );

        cameraClickTimes.push(
          stateStart
        );
      }

      impactCursor =
        Math.max(
          impactCursor,
          segment.end
        );
    }

    if (
      impactCursor <
      options.duration -
        0.001
    ) {
      addImpactFrame(
        impactBlankName,
        options.duration -
          impactCursor
      );
    }

    if (
      impactFrames.length >
      0
    ) {
      const impactConcatName =
        `cutpilot-impact-timeline-${renderId}.ffconcat`;

      const impactConcatLines: string[] =
        [
          "ffconcat version 1.0",
        ];

      for (
        const frame of
        impactFrames
      ) {
        impactConcatLines.push(
          `file '${frame.fileName}'`
        );

        impactConcatLines.push(
          `duration ${Math.max(
            0.001,
            frame.duration
          ).toFixed(6)}`
        );
      }

      impactConcatLines.push(
        `file '${impactFrames[
          impactFrames.length -
            1
        ].fileName}'`
      );

      await ffmpeg.writeFile(
        impactConcatName,
        new TextEncoder().encode(
          impactConcatLines.join(
            "\n"
          )
        )
      );

      subtitleFilesToDelete.push(
        impactConcatName
      );

      impactTimelineInputIndex =
        nextAuxInputIndex;

      nextAuxInputIndex +=
        1;

      args.push(
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        impactConcatName
      );
    }

    if (
      cameraClickTimes.length >
      0
    ) {
      const clickTrackName =
        `cutpilot-camera-clicks-${renderId}.wav`;

      const clickTrack =
        createCameraClickTrackWav(
          options.duration,
          cameraClickTimes
        );

      await ffmpeg.writeFile(
        clickTrackName,
        clickTrack
      );

      subtitleFilesToDelete.push(
        clickTrackName
      );

      cameraClickInputIndex =
        nextAuxInputIndex;

      nextAuxInputIndex +=
        1;

      args.push(
        "-i",
        clickTrackName
      );
    }
  }

  reportProgress(
    21,
    "PREPARING",
    "Construyendo composición final..."
  );

  /*
    ======================================
    FILTER GRAPH
    ======================================
  */

  const filters: string[] =
    [];

  let currentVideoLabel =
    "0:v";

  /*
    ======================================
    SUBTLE PUNCH-IN
    ======================================

    Comportamiento editorial:

    - inicia en 1.00x
    - anima hasta 1.08x en ~200 ms
    - usa una curva ease-out para que el movimiento
      se sienta rápido pero no brusco
    - mantiene 1.08x hasta el final del segmento
    - al terminar vuelve inmediatamente a 1.00x

    El B-roll se coloca DESPUÉS de este efecto,
    así que si ambos coinciden, el B-roll cubre
    correctamente el talking head.
  */

  if (
    effectSegments.length >
    0
  ) {
    const width =
      Math.round(
        options.width
      );

    const height =
      Math.round(
        options.height
      );

    const punchInZoom =
      1.08;

    const punchInAnimationDuration =
      0.2;

    /*
      Construimos una expresión de zoom basada
      en el timestamp global del video.

      Para cada segmento:

      1. de start a start + 0.2 s:
         1.00x → 1.08x

      2. después:
         mantiene 1.08x hasta end

      Usamos sin(progress * PI / 2) como ease-out.
      Así el acercamiento empieza rápido y frena
      suavemente al llegar al encuadre final.
    */
    let zoomExpression =
      "1";

    for (
      let index =
        effectSegments.length - 1;
      index >= 0;
      index -= 1
    ) {
      const segment =
        effectSegments[index];

      const start =
        segment.start;

      const end =
        segment.end;

      const animationEnd =
        Math.min(
          start +
            punchInAnimationDuration,
          end
        );

      const animationDuration =
        Math.max(
          animationEnd -
            start,
          0.001
        );

      const startText =
        start.toFixed(
          3
        );

      const endText =
        end.toFixed(
          3
        );

      const animationEndText =
        animationEnd.toFixed(
          3
        );

      const animationDurationText =
        animationDuration.toFixed(
          3
        );

      const zoomAmount =
        (
          punchInZoom -
          1
        ).toFixed(3);

      const animatedZoom =
        `1+${zoomAmount}*` +
        `sin(((t-${startText})/` +
        `${animationDurationText})*(PI/2))`;

      zoomExpression =
        `if(` +
        `between(t\\,${startText}\\,${endText})\\,` +
        `if(` +
        `lte(t\\,${animationEndText})\\,` +
        `${animatedZoom}\\,` +
        `${punchInZoom.toFixed(3)}` +
        `)\\,` +
        `${zoomExpression}` +
        `)`;
    }

    /*
      scale eval=frame permite recalcular el tamaño
      en cada frame usando la expresión anterior.

      Después crop vuelve a llevar el video al tamaño
      original, siempre centrado. El resultado final
      mantiene la resolución de salida constante.
    */
    filters.push(
      `[0:v]` +
        `scale=` +
        `w='trunc(iw*(${zoomExpression})/2)*2':` +
        `h='trunc(ih*(${zoomExpression})/2)*2':` +
        `eval=frame,` +
        `crop=${width}:${height}:` +
        `(in_w-out_w)/2:` +
        `(in_h-out_h)/2,` +
        `setsar=1` +
        `[talking_head_fx]`
    );

    currentVideoLabel =
      "talking_head_fx";
  }

  /*
    ======================================
    B-ROLL
    ======================================
  */

  brollSegments.forEach(
    (
      segment,
      segmentIndex
    ) => {
      const inputIndex =
        inputIndexByAsset.get(
          segment.assetId
        );

      if (
        inputIndex ===
        undefined
      ) {
        throw new Error(
          `No se pudo resolver el input de ${segment.assetId}.`
        );
      }

      const start =
        segment.start.toFixed(
          3
        );

      const end =
        segment.end.toFixed(
          3
        );

      const segmentDuration =
        (
          segment.end -
          segment.start
        ).toFixed(3);

      const brollLabel =
        `broll_${segmentIndex}`;

      const outputLabel =
        `video_${segmentIndex}`;

      /*
        Normalizamos el B-roll
        al tamaño del video fuente.
      */
      filters.push(
        `[${inputIndex}:v]` +
          `trim=duration=${segmentDuration},` +
          `setpts=PTS-STARTPTS+${start}/TB,` +
          `scale=${Math.round(
            options.width
          )}:${Math.round(
            options.height
          )}:force_original_aspect_ratio=increase,` +
          `crop=${Math.round(
            options.width
          )}:${Math.round(
            options.height
          )},` +
          `setsar=1` +
          `[${brollLabel}]`
      );

      /*
        B-roll encima del talking head.
      */
      filters.push(
        `[${currentVideoLabel}]` +
          `[${brollLabel}]` +
          `overlay=0:0:` +
          `eof_action=pass:` +
          `shortest=0:` +
          `repeatlast=0:` +
          `enable=between(t\\,${start}\\,${end})` +
          `[${outputLabel}]`
      );

      currentVideoLabel =
        outputLabel;
    }
  );

  /*
    ======================================
    IMPACT WORDS
    ======================================

    El stream es transparente fuera de los momentos
    KEY_STATEMENT y full-frame durante el efecto.
    Por eso un único overlay basta.
  */

  if (
    impactTimelineInputIndex !==
    null
  ) {
    const impactTimelineLabel =
      "impact_timeline";

    const impactOutputLabel =
      "impact_video";

    filters.push(
      `[${impactTimelineInputIndex}:v]` +
        `format=rgba,` +
        `fps=30,` +
        `setpts=PTS-STARTPTS` +
        `[${impactTimelineLabel}]`
    );

    filters.push(
      `[${currentVideoLabel}]` +
        `[${impactTimelineLabel}]` +
        `overlay=0:0:` +
        `eof_action=pass:` +
        `shortest=0:` +
        `repeatlast=0` +
        `[${impactOutputLabel}]`
    );

    currentVideoLabel =
      impactOutputLabel;
  }

  /*
    ======================================
    SUBTÍTULOS WORD HIGHLIGHT
    ======================================

    Todo el timeline de captions llega como UN solo
    stream RGBA desde concat.

    Sin:
    - ASS
    - input por palabra
    - overlay por palabra
    - sprite gigante

    La animación bounce queda pausada en esta primera
    versión para priorizar estabilidad + highlight.
  */

  if (
    subtitleTimelineInputIndex !==
    null
  ) {
    const subtitleTimelineLabel =
      "subtitle_timeline";

    const subtitleOutputLabel =
      "subtitle_video";

    filters.push(
      `[${subtitleTimelineInputIndex}:v]` +
        `format=rgba,` +
        `fps=30,` +
        `setpts=PTS-STARTPTS` +
        `[${subtitleTimelineLabel}]`
    );

    filters.push(
      `[${currentVideoLabel}]` +
        `[${subtitleTimelineLabel}]` +
        `overlay=0:0:` +
        `eof_action=pass:` +
        `shortest=0:` +
        `repeatlast=0` +
        `[${subtitleOutputLabel}]`
    );

    currentVideoLabel =
      subtitleOutputLabel;
  }

  /*
    ======================================
    CAMERA CLICK AUDIO
    ======================================
  */

  let audioOutputLabel:
    | string
    | null = null;

  if (
    cameraClickInputIndex !==
    null
  ) {
    filters.push(
      `[${cameraClickInputIndex}:a]` +
        `volume=0.42` +
        `[camera_clicks]`
    );

    filters.push(
      `[0:a:0]` +
        `[camera_clicks]` +
        `amix=` +
        `inputs=2:` +
        `duration=first:` +
        `dropout_transition=0:` +
        `normalize=0` +
        `[audio_mix]`
    );

    audioOutputLabel =
      "audio_mix";
  }

  /*
    ======================================
    MAP VIDEO
    ======================================
  */

  if (
    filters.length > 0
  ) {
    args.push(
      "-filter_complex",
      filters.join(";"),

      "-map",
      `[${currentVideoLabel}]`
    );
  } else {
    args.push(
      "-map",
      "0:v:0"
    );
  }

  /*
    ======================================
    AUDIO
    ======================================
  */

  if (
    audioOutputLabel
  ) {
    args.push(
      "-map",
      `[${audioOutputLabel}]`
    );
  } else {
    args.push(
      "-map",
      "0:a?"
    );
  }

  /*
    ======================================
    OUTPUT
    ======================================
  */

  args.push(
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
    "192k",

    "-t",
    options.duration.toFixed(
      3
    ),

    "-movflags",
    "+faststart",

    outputName
  );

  const handleFfmpegProgress = ({
    progress,
  }: {
    progress: number;
  }) => {
    if (
      !Number.isFinite(progress)
    ) {
      return;
    }

    /*
      Reservamos 0-24% para preparar assets/timelines y
      95-100% para leer/empaquetar el MP4.

      El progreso nativo de FFmpeg ocupa la parte pesada:
      24% -> 95%.
    */
    const normalized =
      Math.max(
        0,
        Math.min(
          1,
          progress
        )
      );

    reportProgress(
      24 +
        normalized * 71,
      "ENCODING",
      "Codificando video..."
    );
  };

  try {
    reportProgress(
      24,
      "ENCODING",
      "Codificando video..."
    );

    ffmpeg.on(
      "progress",
      handleFfmpegProgress
    );

    let exitCode: number;

    try {
      exitCode =
        await ffmpeg.exec(
          args
        );
    } finally {
      ffmpeg.off(
        "progress",
        handleFfmpegProgress
      );
    }

    if (exitCode !== 0) {
      throw new Error(
        "FFmpeg no pudo completar el render del video."
      );
    }

    reportProgress(
      97,
      "FINALIZING",
      "Finalizando MP4..."
    );

    const outputData =
      await ffmpeg.readFile(
        outputName
      );

    if (
      typeof outputData ===
      "string"
    ) {
      throw new Error(
        "FFmpeg devolvió un formato de video inesperado."
      );
    }

    const bytes =
      new Uint8Array(
        outputData.byteLength
      );

    bytes.set(
      outputData
    );

    const blob =
      new Blob(
        [bytes],
        {
          type: "video/mp4",
        }
      );

    reportProgress(
      100,
      "DONE",
      "Render listo."
    );

    return new File(
      [blob],
      "cutpilot-render.mp4",
      {
        type: "video/mp4",
      }
    );
  } finally {
    try {
      await ffmpeg.deleteFile(
        outputName
      );
    } catch {
      // Cleanup best effort.
    }

    for (
      const fileName of
      subtitleFilesToDelete
    ) {
      try {
        await ffmpeg.deleteFile(
          fileName
        );
      } catch {
        // Cleanup best effort.
      }
    }
  }
}