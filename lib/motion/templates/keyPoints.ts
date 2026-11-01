import type {
  KeyPointsMotionGraphicRequest,
} from "@/lib/motion/types";

export type KeyPointsFrameState = {
  introProgress: number;

  pointProgresses: number[];

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
    (
      end -
      start
    ) *
      clamp01(
        progress
      )
  );
}

function easeOutCubic(value: number) {
  const progress =
    clamp01(
      value
    );

  return (
    1 -
    Math.pow(
      1 -
        progress,
      3
    )
  );
}

function easeInCubic(value: number) {
  const progress =
    clamp01(
      value
    );

  return Math.pow(
    progress,
    3
  );
}

function easeOutBack(value: number) {
  const progress =
    clamp01(
      value
    );

  const c1 =
    1.30;

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
    x +
      width -
      r,
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
    y +
      height -
      r
  );

  context.quadraticCurveTo(
    x + width,
    y + height,
    x +
      width -
      r,
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
    y +
      height -
      r
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
  weight = 900
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

  if (
    lines.length >
    maxLines
  ) {
    const visible =
      lines.slice(
        0,
        maxLines
      );

    visible[
      maxLines -
        1
    ] =
      visible[
        maxLines -
          1
      ]
        .replace(
          /\s+$/,
          ""
        ) +
      "…";

    lines =
      visible;
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
                  "No se pudo generar el frame KEY_POINTS."
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

export async function createKeyPointsPng(
  width: number,
  height: number,
  graphic: KeyPointsMotionGraphicRequest,
  state: KeyPointsFrameState
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
      "No se pudo crear el Canvas de KEY_POINTS."
    );
  }

  const context:
    CanvasRenderingContext2D =
      canvasContext;

  const intro =
    easeOutCubic(
      state.introProgress
    );

  const exit =
    easeInCubic(
      state.exitProgress
    );

  const sceneAlpha =
    clamp01(
      intro *
      (
        1 -
        exit
      )
    );

  if (
    sceneAlpha <=
    0.001
  ) {
    return canvasToPng(
      canvas
    );
  }

  const points =
    graphic.points.slice(
      0,
      5
    );

  const pointCount =
    points.length;

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
      height * 0.53,
      0,
      centerX,
      height * 0.53,
      Math.max(
        width * 0.80,
        height * 0.38
      )
    );

  glow.addColorStop(
    0,
    "rgba(190, 242, 100, 0.072)"
  );

  glow.addColorStop(
    0.50,
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
    height * 0.17
  );

  context.lineTo(
    centerX +
      topLineHalfWidth,
    height * 0.17
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
    exit *
      0.018;

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
            0.70
        )
      );

    const labelSize =
      Math.max(
        22,
        Math.round(
          width *
            0.034
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
      height *
        0.245
    );

    context.restore();
  }

  /*
    ========================================
    LIST GEOMETRY
    ========================================

    KEY_POINTS no dibuja conectores entre elementos.
    Son puntos equivalentes, no pasos de un proceso.
  */
  const cardWidth =
    width *
    0.80;

  const cardX =
    (
      width -
      cardWidth
    ) /
    2;

  const topY =
    height *
    0.305;

  const bottomY =
    height *
    0.80;

  const gap =
    Math.max(
      12,
      height *
        0.014
    );

  const availableHeight =
    bottomY -
    topY;

  const rawCardHeight =
    (
      availableHeight -
      gap *
        Math.max(
          0,
          pointCount -
            1
        )
    ) /
    Math.max(
      1,
      pointCount
    );

  const cardHeight =
    Math.max(
      height *
        0.078,
      Math.min(
        height *
          0.145,
        rawCardHeight
      )
    );

  const usedHeight =
    cardHeight *
      pointCount +
    gap *
      Math.max(
        0,
        pointCount -
          1
      );

  const actualTopY =
    topY +
    Math.max(
      0,
      (
        availableHeight -
        usedHeight
      ) /
        2
    );

  const radius =
    Math.max(
      20,
      width *
        0.022
    );

  const numberWidth =
    Math.max(
      78,
      width *
        0.095
    );

  /*
    El último punto visible se considera el "activo"
    durante el reveal. Los anteriores permanecen
    visibles pero más sobrios.
  */
  let activePointIndex =
    -1;

  for (
    let index = 0;
    index <
    pointCount;
    index += 1
  ) {
    if (
      (
        state.pointProgresses[
          index
        ] ??
        0
      ) >
      0.001
    ) {
      activePointIndex =
        index;
    }
  }

  for (
    let index = 0;
    index <
    pointCount;
    index += 1
  ) {
    const rawProgress =
      state.pointProgresses[
        index
      ] ??
      0;

    const progress =
      easeOutBack(
        rawProgress
      );

    if (
      progress <=
      0.001
    ) {
      continue;
    }

    const isActive =
      index ===
      activePointIndex;

    const cardY =
      actualTopY +
      index *
        (
          cardHeight +
          gap
        );

    const slideOffset =
      lerp(
        width *
          0.065,
        0,
        progress
      );

    const cardScale =
      lerp(
        0.965,
        1,
        progress
      );

    context.save();

    context.globalAlpha =
      sceneAlpha *
      clamp01(
        rawProgress *
          1.25
      );

    context.translate(
      cardX +
        cardWidth / 2 +
        slideOffset,
      cardY +
        cardHeight / 2
    );

    context.scale(
      cardScale,
      cardScale
    );

    context.translate(
      -(
        cardX +
        cardWidth / 2
      ),
      -(
        cardY +
        cardHeight / 2
      )
    );

    if (isActive) {
      context.shadowColor =
        "rgba(183, 255, 60, 0.18)";

      context.shadowBlur =
        width *
        0.028;
    }

    roundedRect(
      context,
      cardX,
      cardY,
      cardWidth,
      cardHeight,
      radius
    );

    context.fillStyle =
      isActive
        ? "rgba(190, 242, 100, 0.045)"
        : "rgba(255,255,255,0.026)";

    context.fill();

    context.shadowBlur =
      0;

    roundedRect(
      context,
      cardX,
      cardY,
      cardWidth,
      cardHeight,
      radius
    );

    context.strokeStyle =
      isActive
        ? "rgba(190, 242, 100, 0.62)"
        : "rgba(255,255,255,0.10)";

    context.lineWidth =
      isActive
        ? Math.max(
            2,
            width *
              0.0025
          )
        : Math.max(
            1,
            width *
              0.0015
          );

    context.stroke();

    /*
      Número del punto.
    */
    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    const numberSize =
      Math.max(
        24,
        Math.round(
          width *
            0.030
        )
      );

    context.font =
      `900 ${numberSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      isActive
        ? "#b7ff3c"
        : "#64748b";

    context.fillText(
      String(
        index +
          1
      ).padStart(
        2,
        "0"
      ),
      cardX +
        numberWidth /
          2,
      cardY +
        cardHeight /
          2
    );

    /*
      Separador visual interno.
    */
    context.strokeStyle =
      isActive
        ? "rgba(190, 242, 100, 0.20)"
        : "rgba(255,255,255,0.07)";

    context.lineWidth =
      Math.max(
        1,
        width *
          0.0012
      );

    context.beginPath();

    context.moveTo(
      cardX +
        numberWidth,
      cardY +
        cardHeight *
          0.20
    );

    context.lineTo(
      cardX +
        numberWidth,
      cardY +
        cardHeight *
          0.80
    );

    context.stroke();

    /*
      Título.
    */
    const contentX =
      cardX +
      numberWidth +
      cardWidth *
        0.055;

    const contentWidth =
      cardWidth -
      numberWidth -
      cardWidth *
        0.11;

    const cleanTitle =
      points[
        index
      ].title
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        );

    const titleLayout =
      fitWrappedText(
        context,
        cleanTitle,
        Math.max(
          36,
          Math.round(
            width *
              0.047
          )
        ),
        Math.max(
          24,
          Math.round(
            width *
              0.029
          )
        ),
        contentWidth,
        2,
        900
      );

    const titleLineHeight =
      titleLayout.fontSize *
      1.02;

    const hasDetail =
      Boolean(
        points[
          index
        ].detail?.trim()
      );

    const titleCenterY =
      cardY +
      cardHeight *
        (
          hasDetail
            ? 0.39
            : 0.50
        );

    const titleStartY =
      titleCenterY -
      (
        titleLayout.lines.length -
          1
      ) *
        titleLineHeight /
        2;

    context.textAlign =
      "left";

    context.font =
      `900 ${titleLayout.fontSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      isActive
        ? "#ffffff"
        : "#e2e8f0";

    context.shadowColor =
      "rgba(0,0,0,0.72)";

    context.shadowBlur =
      Math.max(
        6,
        titleLayout.fontSize *
          0.08
      );

    titleLayout.lines.forEach(
      (
        line,
        lineIndex
      ) => {
        context.fillText(
          line,
          contentX,
          titleStartY +
            lineIndex *
              titleLineHeight
        );
      }
    );

    context.shadowBlur =
      0;

    /*
      Detalle opcional.
    */
    const detail =
      points[
        index
      ].detail;

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
            22,
            Math.round(
              width *
                0.026
            )
          ),
          Math.max(
            17,
            Math.round(
              width *
                0.018
            )
          ),
          contentWidth,
          2,
          700
        );

      const detailLineHeight =
        detailLayout.fontSize *
        1.16;

      const detailStartY =
        cardY +
        cardHeight *
          0.70 -
        (
          detailLayout.lines.length -
          1
        ) *
          detailLineHeight /
          2;

      context.font =
        `700 ${detailLayout.fontSize}px Arial, Helvetica, sans-serif`;

      context.fillStyle =
        isActive
          ? "#a3b2c5"
          : "#718096";

      detailLayout.lines.forEach(
        (
          line,
          lineIndex
        ) => {
          context.fillText(
            line,
            contentX,
            detailStartY +
              lineIndex *
                detailLineHeight
          );
        }
      );
    }

    context.restore();
  }

  /*
    Línea inferior sutil una vez que hay contenido.
  */
  const visibleProgress =
    state.pointProgresses.reduce(
      (
        maximum,
        progress
      ) =>
        Math.max(
          maximum,
          clamp01(
            progress
          )
        ),
      0
    );

  if (
    visibleProgress >
    0.001
  ) {
    const lineHalfWidth =
      width *
      0.34 *
      visibleProgress;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      0.45 *
      visibleProgress;

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
        lineHalfWidth,
      height *
        0.84
    );

    context.lineTo(
      centerX +
        lineHalfWidth,
      height *
        0.84
    );

    context.stroke();

    context.restore();
  }

  context.restore();

  return canvasToPng(
    canvas
  );
}
