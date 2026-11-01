import type {
  ComparisonMotionGraphicRequest,
} from "@/lib/motion/types";

export type ComparisonFrameState = {
  introProgress: number;

  leftProgress: number;

  dividerProgress: number;

  rightProgress: number;

  emphasisProgress: number;

  exitProgress: number;
};

function clamp01(value: number) {
  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );
}

function lerp(
  start: number,
  end: number,
  progress: number
) {
  return (
    start +
    (end - start) *
      clamp01(progress)
  );
}

function easeOutCubic(value: number) {
  const progress =
    clamp01(value);

  return (
    1 -
    Math.pow(
      1 - progress,
      3
    )
  );
}

function easeInCubic(value: number) {
  const progress =
    clamp01(value);

  return Math.pow(
    progress,
    3
  );
}

function easeOutBack(value: number) {
  const progress =
    clamp01(value);

  const c1 =
    1.45;

  const c3 =
    c1 + 1;

  return (
    1 +
    c3 *
      Math.pow(
        progress - 1,
        3
      ) +
    c1 *
      Math.pow(
        progress - 1,
        2
      )
  );
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  context.beginPath();

  context.moveTo(
    x + r,
    y
  );

  context.lineTo(
    x + width - r,
    y
  );

  context.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );

  context.lineTo(
    x + width,
    y + height - r
  );

  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );

  context.lineTo(
    x + r,
    y + height
  );

  context.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  );

  context.lineTo(
    x,
    y + r
  );

  context.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );

  context.closePath();
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  initialSize: number,
  minimumSize: number,
  maxWidth: number,
  weight = 900
) {
  let fontSize =
    initialSize;

  while (
    fontSize >
    minimumSize
  ) {
    context.font =
      `${weight} ${fontSize}px Arial, Helvetica, sans-serif`;

    if (
      context.measureText(
        text
      ).width <=
      maxWidth
    ) {
      break;
    }

    fontSize -=
      3;
  }

  return fontSize;
}

function wrapTextAll(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words =
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const lines: string[] =
    [];

  let current =
    "";

  for (
    const word of
    words
  ) {
    const candidate =
      current
        ? `${current} ${word}`
        : word;

    if (
      !current ||
      context.measureText(
        candidate
      ).width <=
        maxWidth
    ) {
      current =
        candidate;

      continue;
    }

    lines.push(
      current
    );

    current =
      word;
  }

  if (current) {
    lines.push(
      current
    );
  }

  return lines;
}

function fitWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  initialSize: number,
  minimumSize: number,
  maxWidth: number,
  maxLines: number,
  weight = 700
) {
  let fontSize =
    initialSize;

  let lines: string[] =
    [];

  while (
    fontSize >=
    minimumSize
  ) {
    context.font =
      `${weight} ${fontSize}px Arial, Helvetica, sans-serif`;

    lines =
      wrapTextAll(
        context,
        text,
        maxWidth
      );

    if (
      lines.length <=
      maxLines
    ) {
      break;
    }

    fontSize -=
      2;
  }

  /*
    En textos extremos preferimos conservar todo
    el contenido antes que recortarlo silenciosamente.
  */
  if (
    lines.length >
    maxLines
  ) {
    const head =
      lines.slice(
        0,
        maxLines - 1
      );

    const tail =
      lines
        .slice(
          maxLines - 1
        )
        .join(" ");

    lines = [
      ...head,
      tail,
    ];
  }

  return {
    fontSize:
      Math.max(
        fontSize,
        minimumSize
      ),

    lines,
  };
}

async function canvasToPng(
  canvas: HTMLCanvasElement
): Promise<Uint8Array> {
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
                  "No se pudo generar el frame COMPARISON."
                )
              );

              return;
            }

            resolve(result);
          },
          "image/png"
        );
      }
    );

  return new Uint8Array(
    await blob.arrayBuffer()
  );
}

export async function createComparisonPng(
  width: number,
  height: number,
  graphic: ComparisonMotionGraphicRequest,
  state: ComparisonFrameState
): Promise<Uint8Array> {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const canvasContext =
    canvas.getContext(
      "2d"
    );

  if (!canvasContext) {
    throw new Error(
      "No se pudo crear el Canvas de COMPARISON."
    );
  }

  /*
    Referencia no-null explícita para que TypeScript
    conserve el tipo dentro de drawCard().
  */
  const context:
    CanvasRenderingContext2D =
      canvasContext;

  const intro =
    easeOutCubic(
      state.introProgress
    );

  const left =
    easeOutBack(
      state.leftProgress
    );

  const divider =
    easeOutCubic(
      state.dividerProgress
    );

  const right =
    easeOutBack(
      state.rightProgress
    );

  const emphasis =
    easeOutCubic(
      state.emphasisProgress
    );

  const exit =
    easeInCubic(
      state.exitProgress
    );

  const sceneAlpha =
    clamp01(
      intro *
      (1 - exit)
    );

  if (
    sceneAlpha <=
    0.001
  ) {
    return canvasToPng(
      canvas
    );
  }

  const centerX =
    width / 2;

  /*
    ========================================
    BACKGROUND
    ========================================
  */
  context.save();

  context.globalAlpha =
    sceneAlpha;

  context.fillStyle =
    "rgba(5, 8, 12, 0.985)";

  context.fillRect(
    0,
    0,
    width,
    height
  );

  const glow =
    context.createRadialGradient(
      centerX,
      height * 0.52,
      0,
      centerX,
      height * 0.52,
      Math.max(
        width * 0.78,
        height * 0.34
      )
    );

  glow.addColorStop(
    0,
    "rgba(190, 242, 100, 0.075)"
  );

  glow.addColorStop(
    0.5,
    "rgba(190, 242, 100, 0.018)"
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

  const topLineHalfWidth =
    width *
    0.38 *
    intro;

  context.strokeStyle =
    "rgba(190, 242, 100, 0.13)";

  context.lineWidth =
    Math.max(
      1,
      width *
        0.0015
    );

  context.beginPath();

  context.moveTo(
    centerX -
      topLineHalfWidth,
    height * 0.18
  );

  context.lineTo(
    centerX +
      topLineHalfWidth,
    height * 0.18
  );

  context.stroke();

  context.restore();

  /*
    ========================================
    GLOBAL EXIT
    ========================================
  */
  const exitScale =
    1 -
    exit * 0.018;

  const exitOffsetY =
    exit *
    height *
    0.01;

  context.save();

  context.translate(
    centerX,
    height / 2 +
      exitOffsetY
  );

  context.scale(
    exitScale,
    exitScale
  );

  context.translate(
    -centerX,
    -height / 2
  );

  /*
    ========================================
    LABEL
    ========================================
  */
  if (
    graphic.label?.trim()
  ) {
    const labelProgress =
      easeOutCubic(
        clamp01(
          state.introProgress /
            0.66
        )
      );

    const labelSize =
      Math.max(
        22,
        Math.round(
          width * 0.034
        )
      );

    context.save();

    context.globalAlpha =
      sceneAlpha *
      labelProgress;

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.font =
      `800 ${labelSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      "#75839a";

    context.fillText(
      graphic.label
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        ),
      centerX,
      height * 0.295
    );

    context.restore();
  }

  /*
    ========================================
    VERTICAL COMPARISON LAYOUT
    ========================================

    En 9:16 no forzamos dos columnas estrechas.

    A ocupa una card ancha arriba.
    B ocupa una card ancha abajo.
    VS vive entre ambas.

    Esto hace que nombres reales de producto
    sigan siendo legibles sin deformar texto.
  */
  const cardWidth =
    width * 0.78;

  const cardHeight =
    height * 0.19;

  const cardX =
    (width -
      cardWidth) /
    2;

  const topCardY =
    height * 0.335;

  const bottomCardY =
    height * 0.57;

  const radius =
    Math.max(
      24,
      width * 0.026
    );

  const titleMaxWidth =
    cardWidth *
    0.80;

  /*
    Un mismo rango tipográfico para A y B.
    Cada título puede ocupar hasta dos líneas,
    pero nunca se comprime horizontalmente.
  */
  const leftTitleLayout =
    fitWrappedText(
      context,
      graphic.leftTitle
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        ),
      Math.max(
        50,
        Math.round(
          width *
          0.062
        )
      ),
      Math.max(
        28,
        Math.round(
          width *
          0.030
        )
      ),
      titleMaxWidth,
      2,
      900
    );

  const rightTitleLayout =
    fitWrappedText(
      context,
      graphic.rightTitle
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        ),
      Math.max(
        50,
        Math.round(
          width *
          0.062
        )
      ),
      Math.max(
        28,
        Math.round(
          width *
          0.030
        )
      ),
      titleMaxWidth,
      2,
      900
    );

  const sharedTitleSize =
    Math.min(
      leftTitleLayout.fontSize,
      rightTitleLayout.fontSize
    );

  function buildTitleLines(
    title: string
  ) {
    context.font =
      `900 ${sharedTitleSize}px Arial, Helvetica, sans-serif`;

    return wrapTextAll(
      context,
      title
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        ),
      titleMaxWidth
    ).slice(
      0,
      2
    );
  }

  function drawCard({
    y,
    progress,
    side,
    title,
    detail,
    highlighted,
  }: {
    y: number;
    progress: number;
    side: "LEFT" | "RIGHT";
    title: string;
    detail: string | null;
    highlighted: boolean;
  }) {
    if (
      progress <=
      0.001
    ) {
      return;
    }

    const slideDistance =
      width * 0.06;

    const offsetX =
      side === "LEFT"
        ? lerp(
            -slideDistance,
            0,
            progress
          )
        : lerp(
            slideDistance,
            0,
            progress
          );

    const cardScale =
      lerp(
        0.96,
        1,
        progress
      );

    const highlightProgress =
      highlighted
        ? emphasis
        : 0;

    const drawX =
      cardX +
      offsetX;

    const drawY =
      y;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      clamp01(
        progress *
        1.2
      );

    context.translate(
      drawX +
        cardWidth / 2,
      drawY +
        cardHeight / 2
    );

    context.scale(
      cardScale,
      cardScale
    );

    context.translate(
      -(
        drawX +
        cardWidth / 2
      ),
      -(
        drawY +
        cardHeight / 2
      )
    );

    if (
      highlightProgress >
      0.001
    ) {
      context.shadowColor =
        `rgba(183, 255, 60, ${
          0.22 *
          highlightProgress
        })`;

      context.shadowBlur =
        width *
        0.04 *
        highlightProgress;
    }

    roundedRect(
      context,
      drawX,
      drawY,
      cardWidth,
      cardHeight,
      radius
    );

    context.fillStyle =
      highlighted
        ? `rgba(190, 242, 100, ${
            0.035 +
            0.025 *
              highlightProgress
          })`
        : "rgba(255,255,255,0.026)";

    context.fill();

    context.shadowBlur =
      0;

    roundedRect(
      context,
      drawX,
      drawY,
      cardWidth,
      cardHeight,
      radius
    );

    context.strokeStyle =
      highlighted
        ? `rgba(190, 242, 100, ${
            0.24 +
            0.56 *
              highlightProgress
          })`
        : "rgba(255,255,255,0.105)";

    context.lineWidth =
      highlighted
        ? Math.max(
            2,
            width *
              0.003 *
              Math.max(
                0.5,
                highlightProgress
              )
          )
        : Math.max(
            1,
            width *
              0.0015
          );

    context.stroke();

    /*
      A / B badge
    */
    const badgeSize =
      Math.max(
        24,
        Math.round(
          width *
          0.028
        )
      );

    context.textAlign =
      "left";

    context.textBaseline =
      "middle";

    context.font =
      `900 ${badgeSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      highlighted
        ? "#b7ff3c"
        : "#75839a";

    context.fillText(
      side === "LEFT"
        ? "A"
        : "B",
      drawX +
        cardWidth *
          0.075,
      drawY +
        cardHeight *
          0.19
    );

    /*
      TITLE
    */
    const titleLines =
      buildTitleLines(
        title
      );

    context.font =
      `900 ${sharedTitleSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      highlighted &&
      highlightProgress >
        0.55
        ? "#b7ff3c"
        : "#ffffff";

    context.shadowColor =
      "rgba(0,0,0,0.82)";

    context.shadowBlur =
      Math.max(
        8,
        sharedTitleSize *
          0.10
      );

    const titleLineHeight =
      sharedTitleSize *
      1.02;

    const titleStartY =
      drawY +
      cardHeight *
        0.45 -
      (
        titleLines.length -
        1
      ) *
        titleLineHeight /
        2;

    titleLines.forEach(
      (
        line,
        index
      ) => {
        context.fillText(
          line,
          drawX +
            cardWidth *
              0.075,
          titleStartY +
            index *
              titleLineHeight
        );
      }
    );

    context.shadowBlur =
      0;

    /*
      DETAIL
    */
    if (
      detail?.trim()
    ) {
      const cleanDetail =
        detail
          .trim()
          .toLocaleUpperCase(
            "es-MX"
          );

      const detailLayout =
        fitWrappedText(
          context,
          cleanDetail,
          Math.max(
            24,
            Math.round(
              width *
              0.027
            )
          ),
          Math.max(
            18,
            Math.round(
              width *
              0.019
            )
          ),
          cardWidth *
            0.80,
          2,
          700
        );

      const detailSize =
        detailLayout.fontSize;

      const detailLines =
        detailLayout.lines;

      context.font =
        `700 ${detailSize}px Arial, Helvetica, sans-serif`;

      context.fillStyle =
        "#8b98aa";

      const detailLineHeight =
        detailSize *
        1.18;

      const detailStartY =
        drawY +
        cardHeight *
          0.77 -
        (
          detailLines.length -
          1
        ) *
          detailLineHeight /
          2;

      detailLines.forEach(
        (
          line,
          index
        ) => {
          context.fillText(
            line,
            drawX +
              cardWidth *
                0.075,
            detailStartY +
              index *
                detailLineHeight
          );
        }
      );
    }

    context.restore();
  }

  const leftHighlighted =
    graphic.emphasis ===
      "LEFT";

  const rightHighlighted =
    graphic.emphasis ===
      "RIGHT";

  drawCard({
    y: topCardY,

    progress:
      clamp01(
        left
      ),

    side: "LEFT",

    title:
      graphic.leftTitle,

    detail:
      graphic.leftDetail,

    highlighted:
      leftHighlighted,
  });

  drawCard({
    y: bottomCardY,

    progress:
      clamp01(
        right
      ),

    side: "RIGHT",

    title:
      graphic.rightTitle,

    detail:
      graphic.rightDetail,

    highlighted:
      rightHighlighted,
  });

  /*
    ========================================
    VS BADGE
    ========================================
  */
  if (
    divider >
    0.001
  ) {
    const badgeRadius =
      Math.max(
        34,
        width * 0.043
      );

    const badgeScale =
      lerp(
        0.72,
        1,
        divider
      );

    const badgeY =
      (
        topCardY +
        cardHeight +
        bottomCardY
      ) /
      2;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      divider;

    context.translate(
      centerX,
      badgeY
    );

    context.scale(
      badgeScale,
      badgeScale
    );

    context.beginPath();

    context.arc(
      0,
      0,
      badgeRadius,
      0,
      Math.PI * 2
    );

    context.fillStyle =
      "#0b1018";

    context.fill();

    context.strokeStyle =
      "rgba(190, 242, 100, 0.46)";

    context.lineWidth =
      Math.max(
        2,
        width * 0.002
      );

    context.stroke();

    const vsSize =
      Math.max(
        26,
        Math.round(
          width * 0.034
        )
      );

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.font =
      `900 ${vsSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      "#b7ff3c";

    context.fillText(
      "VS",
      0,
      1
    );

    context.restore();
  }

  /*
    Una línea inferior aparece cuando la escena
    ya está completa. Es sólo polish visual.
  */
  const completeProgress =
    Math.min(
      right,
      Math.max(
        divider,
        right
      )
    );

  if (
    completeProgress >
    0.001
  ) {
    const lineWidth =
      width *
      0.34 *
      completeProgress;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      0.55 *
      completeProgress;

    context.strokeStyle =
      "rgba(190, 242, 100, 0.16)";

    context.lineWidth =
      Math.max(
        1,
        width *
          0.0015
      );

    context.beginPath();

    context.moveTo(
      centerX -
        lineWidth,
      height * 0.80
    );

    context.lineTo(
      centerX +
        lineWidth,
      height * 0.75
    );

    context.stroke();

    context.restore();
  }

  context.restore();

  return canvasToPng(
    canvas
  );
}
