import { getFFmpeg, resetFFmpeg } from "@/lib/extractAudio";

export type VoiceOverRenderBrollInput = {
  assetId: string;
  path: string;
  file: File;
};

export type VoiceOverRenderSegment = {
  assetId: string;
  start: number;
  end: number;
};

export type VoiceOverSubtitleWord = {
  word: string;
  start: number;
  end: number;
};

export type VoiceOverSubtitleSegment = {
  start: number;
  end: number;
  text: string;
  words?: VoiceOverSubtitleWord[];
};

export type VoiceOverImpactWord = {
  word: string;
  start: number;
  end: number;
};

export type VoiceOverImpactSegment = {
  start: number;
  end: number;
  words: VoiceOverImpactWord[];
  impactText?: string | null;
};

export type VoiceOverRenderProgress = {
  percent: number;

  phase:
    | "INITIALIZING"
    | "PREPARING"
    | "ENCODING"
    | "FINALIZING"
    | "DONE";

  message: string;
};

type VoiceOverRenderOptions = {
  width: number;
  height: number;
  duration: number;

  brollSegments:
    VoiceOverRenderSegment[];

  subtitleSegments?:
    VoiceOverSubtitleSegment[];

  impactSegments?:
    VoiceOverImpactSegment[];

  onProgress?: (
    update:
      VoiceOverRenderProgress
  ) => void;
};

/*
  ==========================================
  SUBTITLE STYLE
  ==========================================
  Mismos valores visuales usados por Auto Edit.
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

const SUBTITLE_ACTIVE_WORD_SCALE =
  1.08;

function getSafeExtension(
  value: string,
  fallback: string
) {
  const match =
    value
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/);

  return match?.[1] ??
    fallback;
}

function pickSubtitleEmoji(
  text: string
) {
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
    {
      emoji: "🤖",
      pattern:
        /\b(ia|ai|inteligencia artificial|chatgpt|openai|modelo|modelos)\b/i,
    },
    {
      emoji: "🎬",
      pattern:
        /\b(video|videos|editar|edici[oó]n|editor|render|renderizar|clip|clips|short|shorts|tiktok|youtube)\b/i,
    },
    {
      emoji: "🌐",
      pattern:
        /\b(web|p[aá]gina|sitio|website|internet|online|navegador|browser)\b/i,
    },
    {
      emoji: "💡",
      pattern:
        /\b(idea|ideas|tip|tips|consejo|consejos|truco|trucos)\b/i,
    },
    {
      emoji: "⚡",
      pattern:
        /\b(r[aá]pido|r[aá]pida|velocidad|speed|instant[aá]neo|automatizar|autom[aá]tico|automatica|automático)\b/i,
    },
    {
      emoji: "✅",
      pattern:
        /\b(listo|funciona|correcto|correcta|mejor|soluci[oó]n|resultado|resultados)\b/i,
    },
    {
      emoji: "📈",
      pattern:
        /\b(crecer|crecimiento|ventas|conversi[oó]n|conversiones|mejorar|aumentar|engagement)\b/i,
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
  context:
    CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words =
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const lines:
    string[] = [];

  let currentLine =
    "";

  for (
    const word of words
  ) {
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

  for (
    const word of words
  ) {
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

    if (
      /\d/.test(
        word
      )
    ) {
      score += 8;
    }

    if (
      /[a-záéíóúñ][A-ZÁÉÍÓÚÑ]/.test(
        word
      )
    ) {
      score += 4;
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
    highlightedWordIndex?:
      number | null;
    disableSemanticAccent?:
      boolean;
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

  const uppercaseText =
    text.toLocaleUpperCase(
      "es-MX"
    );

  const displayText =
    emoji
      ? `${uppercaseText} ${emoji}`
      : uppercaseText;

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

  let lines:
    string[] = [];

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

    fontSize -= 2;
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

  context.strokeStyle =
    "rgba(0, 0, 0, 0.74)";

  context.lineWidth =
    Math.max(
      2.5,
      fontSize * 0.055
    );

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
            lineWords.length -
              1;

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

          x += tokenWidth;
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

type VisibleRange = {
  start: number;
  end: number;
};

function subtractCoveredRanges(
  start: number,
  end: number,
  covers: VisibleRange[]
) {
  if (covers.length === 0) {
    return [
      {
        start,
        end,
      },
    ];
  }

  const sortedCovers = covers
    .filter(
      (range) =>
        range.end > start &&
        range.start < end
    )
    .map((range) => ({
      start: Math.max(start, range.start),
      end: Math.min(end, range.end),
    }))
    .sort(
      (a, b) =>
        a.start - b.start
    );

  const visible: VisibleRange[] = [];
  let cursor = start;

  for (const cover of sortedCovers) {
    if (cover.start > cursor + 0.001) {
      visible.push({
        start: cursor,
        end: cover.start,
      });
    }

    cursor = Math.max(
      cursor,
      cover.end
    );
  }

  if (cursor < end - 0.001) {
    visible.push({
      start: cursor,
      end,
    });
  }

  return visible.filter(
    (range) =>
      range.end >
      range.start + 0.001
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
    Mismo tratamiento visual de Edit Engine:

    - oscurece TODO el frame
    - el B-roll sigue visible detrás
    - una sola palabra grande al centro
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
      Halo lime suave detrás de la palabra.
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

export async function renderVoiceOverVideo(
  audioFile: File,
  brollInputs:
    VoiceOverRenderBrollInput[],
  options:
    VoiceOverRenderOptions
): Promise<File> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "El renderer de Voice-over solo puede ejecutarse en el navegador."
    );
  }

  if (
    !Number.isFinite(
      options.width
    ) ||
    options.width <= 0 ||
    !Number.isFinite(
      options.height
    ) ||
    options.height <= 0
  ) {
    throw new Error(
      "La resolución de salida no es válida."
    );
  }

  if (
    !Number.isFinite(
      options.duration
    ) ||
    options.duration <= 0
  ) {
    throw new Error(
      "La duración del render no es válida."
    );
  }

  const segments =
    [...options.brollSegments]
      .filter(
        (segment) =>
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >= 0 &&
          segment.end >
            segment.start
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  if (
    segments.length === 0
  ) {
    throw new Error(
      "No hay segmentos de B-roll para renderizar."
    );
  }

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
          segment.start >= 0 &&
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
          segment.end >
            segment.start &&
          segment.start <
            options.duration
      )
      .map(
        (segment) => ({
          start: Math.max(
            0,
            segment.start
          ),
          end: Math.min(
            options.duration,
            segment.end
          ),
          impactText:
            typeof segment.impactText ===
            "string"
              ? segment.impactText.trim()
              : null,
          words:
            (segment.words ?? [])
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
                  start: Math.max(
                    segment.start,
                    word.start
                  ),
                  end: Math.min(
                    segment.end,
                    Math.max(
                      word.start,
                      word.end
                    )
                  ),
                })
              )
              .filter(
                (word) =>
                  word.end >
                  word.start
              ),
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  const tolerance =
    0.02;

  if (
    Math.abs(
      segments[0].start
    ) >
    tolerance
  ) {
    throw new Error(
      "La timeline visual no comienza en 0."
    );
  }

  for (
    let index = 1;
    index <
    segments.length;
    index += 1
  ) {
    const previous =
      segments[
        index - 1
      ];

    const current =
      segments[index];

    if (
      Math.abs(
        current.start -
          previous.end
      ) >
      tolerance
    ) {
      throw new Error(
        "La timeline visual contiene huecos o solapamientos."
      );
    }
  }

  if (
    Math.abs(
      segments[
        segments.length - 1
      ].end -
        options.duration
    ) >
    tolerance
  ) {
    throw new Error(
      "La timeline visual no cubre la duración completa del audio."
    );
  }

  const inputByAsset =
    new Map(
      brollInputs.map(
        (input) => [
          input.assetId,
          input,
        ]
      )
    );

  for (
    const segment of
      segments
  ) {
    if (
      !inputByAsset.has(
        segment.assetId
      )
    ) {
      throw new Error(
        `No se recibió el asset ${segment.assetId} requerido por la timeline.`
      );
    }
  }

  const reportProgress = (
    percent: number,
    phase:
      VoiceOverRenderProgress["phase"],
    message: string
  ) => {
    options.onProgress?.({
      percent:
        Math.max(
          0,
          Math.min(
            100,
            Math.round(
              percent
            )
          )
        ),

      phase,

      message,
    });
  };

  reportProgress(
    2,
    "INITIALIZING",
    "Inicializando FFmpeg..."
  );

  /*
    Cada render de B-Roll Engine usa un Worker limpio.
    Si una ejecución anterior abortó por memoria, no
    heredamos esa instancia WASM.
  */
  resetFFmpeg();

  const ffmpeg =
    await getFFmpeg();

  const {
    fetchFile,
  } =
    await import(
      "@ffmpeg/util"
    );

  const renderId =
    crypto.randomUUID();

  const audioExtension =
    getSafeExtension(
      audioFile.name,
      "mp3"
    );

  const audioInputName =
    `cutpilot-voice-${renderId}.${audioExtension}`;

  const videoConcatName =
    `cutpilot-voice-concat-${renderId}.ffconcat`;

  const subtitleConcatName =
    `cutpilot-voice-subtitles-${renderId}.ffconcat`;

  const outputName =
    `cutpilot-broll-render-${renderId}.mp4`;

  const filesToDelete:
    string[] = [];

  async function execWithDiagnostics(
    args: string[],
    context: string
  ) {
    const logs:
      string[] = [];

    const handleLog = ({
      message,
    }: {
      message: string;
    }) => {
      if (
        typeof message !==
          "string" ||
        !message.trim()
      ) {
        return;
      }

      logs.push(
        message.trim()
      );

      if (
        logs.length > 60
      ) {
        logs.splice(
          0,
          logs.length - 60
        );
      }
    };

    ffmpeg.on(
      "log",
      handleLog
    );

    let exitCode:
      number;

    try {
      exitCode =
        await ffmpeg.exec(
          args
        );
    } finally {
      ffmpeg.off(
        "log",
        handleLog
      );
    }

    if (
      exitCode !== 0
    ) {
      const diagnostic =
        logs
          .slice(-16)
          .join("\n");

      console.error(
        `CutPilot Voice-over FFmpeg diagnostic (${context}):`,
        diagnostic
      );

      throw new Error(
        diagnostic
          ? `${context}\n\n${diagnostic}`
          : context
      );
    }
  }

  try {
    /*
      ==========================================
      ETAPA 1 — B-ROLL SECUENCIAL
      ==========================================
    */
    const segmentOutputNames:
      string[] = [];

    for (
      let index = 0;
      index <
      segments.length;
      index += 1
    ) {
      const segment =
        segments[index];

      const input =
        inputByAsset.get(
          segment.assetId
        );

      if (!input) {
        throw new Error(
          `No se encontró el asset ${segment.assetId}.`
        );
      }

      const extension =
        getSafeExtension(
          input.path,
          "mp4"
        );

      const sourceName =
        `cutpilot-voice-source-${renderId}-${index}.${extension}`;

      const segmentName =
        `cutpilot-voice-segment-${renderId}-${index}.mp4`;

      const segmentDuration =
        Math.max(
          0.001,
          segment.end -
            segment.start
        );

      reportProgress(
        5 +
          (index /
            Math.max(
              1,
              segments.length
            )) *
            62,
        "ENCODING",
        `Renderizando segmento ${index + 1}/${segments.length}...`
      );

      await ffmpeg.writeFile(
        sourceName,
        await fetchFile(
          input.file
        )
      );

      try {
        await execWithDiagnostics(
          [
            "-stream_loop",
            "-1",

            "-i",
            sourceName,

            "-t",
            segmentDuration.toFixed(
              3
            ),

            "-an",

            "-vf",
            [
              `scale=${Math.round(
                options.width
              )}:${Math.round(
                options.height
              )}:force_original_aspect_ratio=increase`,
              `crop=${Math.round(
                options.width
              )}:${Math.round(
                options.height
              )}`,
              "setsar=1",
              "fps=30",
              "format=yuv420p",
            ].join(","),

            "-c:v",
            "libx264",

            "-preset",
            "ultrafast",

            "-crf",
            "23",

            "-pix_fmt",
            "yuv420p",

            "-movflags",
            "+faststart",

            segmentName,
          ],
          `FFmpeg falló al preparar el segmento ${index + 1}/${segments.length}.`
        );
      } finally {
        try {
          await ffmpeg.deleteFile(
            sourceName
          );
        } catch {
          // Cleanup best effort.
        }
      }

      filesToDelete.push(
        segmentName
      );

      segmentOutputNames.push(
        segmentName
      );
    }

    /*
      ==========================================
      ETAPA 2 — CONCAT VISUAL
      ==========================================
    */
    reportProgress(
      69,
      "PREPARING",
      "Construyendo timeline visual..."
    );

    const videoConcatLines =
      [
        "ffconcat version 1.0",

        ...segmentOutputNames.map(
          (fileName) =>
            `file '${fileName}'`
        ),
      ];

    await ffmpeg.writeFile(
      videoConcatName,
      new TextEncoder().encode(
        videoConcatLines.join(
          "\n"
        )
      )
    );

    filesToDelete.push(
      videoConcatName
    );

    /*
      ==========================================
      ETAPA 3 — SUBTITLE TIMELINE
      ==========================================

      Ahora los subtítulos se silencian solamente
      durante rangos IMPACT_WORD. Fuera de esos
      rangos, la timeline normal permanece intacta.
    */
    let hasSubtitleTimeline =
      false;

    const impactMuteRanges =
      impactSegments.map(
        (segment) => ({
          start: segment.start,
          end: segment.end,
        })
      );

    if (
      subtitleSegments.length >
      0
    ) {
      reportProgress(
        71,
        "PREPARING",
        "Preparando subtítulos..."
      );

      const width =
        Math.round(
          options.width
        );

      const height =
        Math.round(
          options.height
        );

      const blankName =
        `cutpilot-voice-subtitle-blank-${renderId}.png`;

      await ffmpeg.writeFile(
        blankName,
        await createTransparentSubtitlePng(
          width,
          height
        )
      );

      filesToDelete.push(
        blankName
      );

      type TimelineFrame = {
        fileName: string;
        duration: number;
      };

      const timelineFrames:
        TimelineFrame[] = [];

      const addFrame = (
        fileName: string,
        duration: number
      ) => {
        if (
          !Number.isFinite(
            duration
          ) ||
          duration <= 0.001
        ) {
          return;
        }

        timelineFrames.push({
          fileName,
          duration,
        });
      };

      let cursor = 0;

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
          cursor + 0.001
        ) {
          addFrame(
            blankName,
            subtitle.start -
              cursor
          );

          cursor =
            subtitle.start;
        }

        const visibleRanges =
          subtractCoveredRanges(
            subtitle.start,
            subtitle.end,
            impactMuteRanges
          );

        if (
          visibleRanges.length ===
          0
        ) {
          if (
            subtitle.end >
            cursor + 0.001
          ) {
            addFrame(
              blankName,
              subtitle.end -
                cursor
            );

            cursor =
              subtitle.end;
          }

          continue;
        }

        const allWords =
          (
            subtitle.words ??
            []
          ).map(
            (word, index) => ({
              ...word,
              cueWordIndex:
                index,
            })
          );

        for (
          const visibleRange of
            visibleRanges
        ) {
          if (
            visibleRange.start >
            cursor + 0.001
          ) {
            addFrame(
              blankName,
              visibleRange.start -
                cursor
            );

            cursor =
              visibleRange.start;
          }

          const rangeWords =
            allWords.filter(
              (word) =>
                word.end >
                  visibleRange.start &&
                word.start <
                  visibleRange.end
            );

          if (
            rangeWords.length ===
            0
          ) {
            const fileName =
              `cutpilot-voice-subtitle-${cueIndex}-${visibleRange.start.toFixed(3).replace(/\./g, "_")}-base-${renderId}.png`;

            await ffmpeg.writeFile(
              fileName,
              await createSubtitlePng(
                width,
                height,
                subtitle.text
              )
            );

            filesToDelete.push(
              fileName
            );

            addFrame(
              fileName,
              visibleRange.end -
                visibleRange.start
            );

            cursor =
              visibleRange.end;
            continue;
          }

          const firstWordStart =
            Math.max(
              visibleRange.start,
              rangeWords[0].start
            );

          if (
            firstWordStart >
            visibleRange.start +
              0.001
          ) {
            const baseName =
              `cutpilot-voice-subtitle-${cueIndex}-${visibleRange.start.toFixed(3).replace(/\./g, "_")}-pre-${renderId}.png`;

            await ffmpeg.writeFile(
              baseName,
              await createSubtitlePng(
                width,
                height,
                subtitle.text,
                {
                  disableSemanticAccent:
                    true,
                }
              )
            );

            filesToDelete.push(
              baseName
            );

            addFrame(
              baseName,
              firstWordStart -
                visibleRange.start
            );

            cursor =
              firstWordStart;
          }

          for (
            let wordIndex = 0;
            wordIndex <
            rangeWords.length;
            wordIndex += 1
          ) {
            const word =
              rangeWords[
                wordIndex
              ];

            const nextWord =
              rangeWords[
                wordIndex + 1
              ];

            const stateStart =
              Math.max(
                visibleRange.start,
                word.start
              );

            const stateEnd =
              Math.min(
                visibleRange.end,
                nextWord
                  ? Math.max(
                      stateStart +
                        0.04,
                      nextWord.start
                    )
                  : visibleRange.end
              );

            if (
              stateEnd <=
              stateStart
            ) {
              continue;
            }

            const fileName =
              `cutpilot-voice-subtitle-${cueIndex}-word-${word.cueWordIndex}-${stateStart.toFixed(3).replace(/\./g, "_")}-${renderId}.png`;

            await ffmpeg.writeFile(
              fileName,
              await createSubtitlePng(
                width,
                height,
                subtitle.text,
                {
                  highlightedWordIndex:
                    word.cueWordIndex,
                  disableSemanticAccent:
                    true,
                }
              )
            );

            filesToDelete.push(
              fileName
            );

            addFrame(
              fileName,
              stateEnd -
                stateStart
            );

            cursor =
              stateEnd;
          }
        }

        if (
          subtitle.end >
          cursor + 0.001
        ) {
          addFrame(
            blankName,
            subtitle.end -
              cursor
          );

          cursor =
            subtitle.end;
        }
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

      if (
        timelineFrames.length >
        0
      ) {
        const concatLines:
          string[] = [
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
          subtitleConcatName,
          new TextEncoder().encode(
            concatLines.join(
              "\n"
            )
          )
        );

        filesToDelete.push(
          subtitleConcatName
        );

        hasSubtitleTimeline =
          true;
      }
    }

    /*
      ==========================================
      ETAPA 4 — IMPACT WORDS TIMELINE
      ==========================================

      Port directo del comportamiento estable
      de Edit Engine:

      - overlay oscuro full-frame
      - UNA palabra grande a la vez
      - palabra sincronizada con Whisper
      - click de cámara por palabra
    */
    let hasImpactTimeline =
      false;

    const impactConcatName =
      `cutpilot-voice-impact-${renderId}.ffconcat`;

    const cameraClickTimes:
      number[] = [];

    if (
      impactSegments.length >
      0
    ) {
      reportProgress(
        78,
        "PREPARING",
        "Preparando Impact Words..."
      );

      const width =
        Math.round(
          options.width
        );

      const height =
        Math.round(
          options.height
        );

      const blankName =
        `cutpilot-voice-impact-blank-${renderId}.png`;

      await ffmpeg.writeFile(
        blankName,
        await createTransparentSubtitlePng(
          width,
          height
        )
      );

      filesToDelete.push(
        blankName
      );

      const darkName =
        `cutpilot-voice-impact-dark-${renderId}.png`;

      await ffmpeg.writeFile(
        darkName,
        await createImpactWordPng(
          width,
          height,
          null
        )
      );

      filesToDelete.push(
        darkName
      );

      type ImpactFrame = {
        fileName: string;
        duration: number;
      };

      const impactFrames:
        ImpactFrame[] = [];

      const addImpactFrame = (
        fileName: string,
        duration: number
      ) => {
        if (
          !Number.isFinite(
            duration
          ) ||
          duration <= 0.001
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

      for (
        let impactIndex = 0;
        impactIndex <
        impactSegments.length;
        impactIndex += 1
      ) {
        const impact =
          impactSegments[
            impactIndex
          ];

        const segmentStart =
          Math.max(
            impactCursor,
            impact.start
          );

        if (
          segmentStart >
          impactCursor +
            0.001
        ) {
          addImpactFrame(
            blankName,
            segmentStart -
              impactCursor
          );
        }

        const words =
          impact.words.filter(
            (word) =>
              word.start <
                impact.end &&
              word.end >
                segmentStart
          );

        if (
          words.length ===
          0
        ) {
          addImpactFrame(
            darkName,
            impact.end -
              segmentStart
          );

          impactCursor =
            impact.end;

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
            darkName,
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
              wordIndex + 1
            ];

          const stateStart =
            Math.max(
              segmentStart,
              word.start
            );

          const stateEnd =
            Math.min(
              impact.end,
              nextWord
                ? Math.max(
                    stateStart +
                      0.04,
                    nextWord.start
                  )
                : impact.end
            );

          if (
            stateEnd <=
            stateStart
          ) {
            continue;
          }

          const fileName =
            `cutpilot-voice-impact-${impactIndex}-word-${wordIndex}-${renderId}.png`;

          await ffmpeg.writeFile(
            fileName,
            await createImpactWordPng(
              width,
              height,
              word.word
            )
          );

          filesToDelete.push(
            fileName
          );

          addImpactFrame(
            fileName,
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
            impact.end
          );
      }

      if (
        impactCursor <
        options.duration -
          0.001
      ) {
        addImpactFrame(
          blankName,
          options.duration -
            impactCursor
        );
      }

      if (
        impactFrames.length >
        0
      ) {
        const concatLines:
          string[] = [
            "ffconcat version 1.0",
          ];

        for (
          const frame of
            impactFrames
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
          `file '${impactFrames[
            impactFrames.length -
              1
          ].fileName}'`
        );

        await ffmpeg.writeFile(
          impactConcatName,
          new TextEncoder().encode(
            concatLines.join(
              "\n"
            )
          )
        );

        filesToDelete.push(
          impactConcatName
        );

        hasImpactTimeline =
          true;
      }
    }

    /*
      ==========================================
      ETAPA 5 — AUDIO
      ==========================================
    */
    reportProgress(
      82,
      "PREPARING",
      "Añadiendo voice-over..."
    );

    await ffmpeg.writeFile(
      audioInputName,
      await fetchFile(
        audioFile
      )
    );

    filesToDelete.push(
      audioInputName
    );

    let cameraClickName:
      string | null = null;

    if (
      cameraClickTimes.length >
      0
    ) {
      cameraClickName =
        `cutpilot-voice-camera-clicks-${renderId}.wav`;

      await ffmpeg.writeFile(
        cameraClickName,
        createCameraClickTrackWav(
          options.duration,
          cameraClickTimes
        )
      );

      filesToDelete.push(
        cameraClickName
      );
    }

    /*
      ==========================================
      ETAPA 6 — COMPOSICIÓN FINAL
      ==========================================
    */
    const args:
      string[] = [
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        videoConcatName,
      ];

    let subtitleInputIndex:
      number | null = null;
    let impactInputIndex:
      number | null = null;

    if (
      hasSubtitleTimeline
    ) {
      subtitleInputIndex =
        args.filter(
          (value) => value === "-i"
        ).length;

      args.push(
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        subtitleConcatName
      );
    }

    if (
      hasImpactTimeline
    ) {
      impactInputIndex =
        args.filter(
          (value) => value === "-i"
        ).length;

      args.push(
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        impactConcatName
      );
    }

    const audioInputIndex =
      args.filter(
        (value) => value === "-i"
      ).length;

    args.push(
      "-i",
      audioInputName
    );

    let cameraClickInputIndex:
      number | null = null;

    if (
      cameraClickName
    ) {
      cameraClickInputIndex =
        args.filter(
          (value) => value === "-i"
        ).length;

      args.push(
        "-i",
        cameraClickName
      );
    }

    if (
      hasSubtitleTimeline ||
      hasImpactTimeline ||
      cameraClickInputIndex !== null
    ) {
      const filters: string[] = [
        "[0:v]setpts=PTS-STARTPTS[base_video]",
      ];

      let currentVideoLabel =
        "base_video";

      if (
        subtitleInputIndex !==
        null
      ) {
        filters.push(
          `[${subtitleInputIndex}:v]format=rgba,fps=30,setpts=PTS-STARTPTS[subtitle_timeline]`
        );

        filters.push(
          `[${currentVideoLabel}][subtitle_timeline]overlay=0:0:eof_action=pass:shortest=0:repeatlast=0[video_with_subtitles]`
        );

        currentVideoLabel =
          "video_with_subtitles";
      }

      if (
        impactInputIndex !==
        null
      ) {
        filters.push(
          `[${impactInputIndex}:v]format=rgba,fps=30,setpts=PTS-STARTPTS[impact_timeline]`
        );

        filters.push(
          `[${currentVideoLabel}][impact_timeline]overlay=0:0:eof_action=pass:shortest=0:repeatlast=0[video_out]`
        );
      } else {
        filters.push(
          `[${currentVideoLabel}]null[video_out]`
        );
      }

      let audioMap =
        `${audioInputIndex}:a:0`;

      if (
        cameraClickInputIndex !==
        null
      ) {
        filters.push(
          `[${cameraClickInputIndex}:a]volume=0.42[camera_clicks]`
        );

        filters.push(
          `[${audioInputIndex}:a:0][camera_clicks]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[audio_mix]`
        );

        audioMap =
          "[audio_mix]";
      }

      args.push(
        "-filter_complex",
        filters.join(";"),

        "-map",
        "[video_out]",

        "-map",
        audioMap,

        "-c:v",
        "libx264",

        "-preset",
        "ultrafast",

        "-crf",
        "23",

        "-pix_fmt",
        "yuv420p"
      );
    } else {
      args.push(
        "-map",
        "0:v:0",

        "-map",
        `${audioInputIndex}:a:0`,

        "-c:v",
        "copy"
      );
    }

    args.push(
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

    reportProgress(
      86,
      "ENCODING",
      hasImpactTimeline
        ? "Aplicando Impact Words de Edit Engine..."
        : hasSubtitleTimeline
          ? "Aplicando subtítulos..."
          : "Construyendo MP4 final..."
    );

    await execWithDiagnostics(
      args,
      hasImpactTimeline || hasSubtitleTimeline
        ? "FFmpeg falló al aplicar overlays al video final."
        : "FFmpeg falló al unir el video final con el voice-over."
    );

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
        "FFmpeg devolvió un formato inesperado."
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
          type:
            "video/mp4",
        }
      );

    reportProgress(
      100,
      "DONE",
      "Render listo."
    );

    return new File(
      [blob],
      "cutpilot-broll-render.mp4",
      {
        type:
          "video/mp4",
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
}