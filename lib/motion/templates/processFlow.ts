import type {
  ProcessFlowMotionGraphicRequest,
} from "@/lib/motion/types";

export type ProcessFlowFrameState = {
  introProgress: number;

  stepProgresses: number[];

  connectorProgresses: number[];

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
    1.35;

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
                  "No se pudo generar el frame PROCESS_FLOW."
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

export async function createProcessFlowPng(
  width: number,
  height: number,
  graphic: ProcessFlowMotionGraphicRequest,
  state: ProcessFlowFrameState
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
      "No se pudo crear el Canvas de PROCESS_FLOW."
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

  const steps =
    graphic.steps.slice(
      0,
      5
    );

  const stepCount =
    steps.length;

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
      height * 0.54,
      0,
      centerX,
      height * 0.54,
      Math.max(
        width * 0.78,
        height * 0.38
      )
    );

  glow.addColorStop(
    0,
    "rgba(190, 242, 100, 0.075)"
  );

  glow.addColorStop(
    0.48,
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
    FLOW GEOMETRY
    ========================================
  */
  const cardWidth =
    width *
    0.78;

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

  const connectorGap =
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
      connectorGap *
        Math.max(
          0,
          stepCount -
            1
        )
    ) /
    Math.max(
      1,
      stepCount
    );

  const cardHeight =
    Math.max(
      height *
        0.073,
      Math.min(
        height *
          0.125,
        rawCardHeight
      )
    );

  const usedHeight =
    cardHeight *
      stepCount +
    connectorGap *
      Math.max(
        0,
        stepCount -
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

  const numberRadius =
    Math.max(
      25,
      width *
        0.032
    );

  /*
    El último paso visible funciona como "activo".
    Los anteriores quedan completos pero más sobrios.
  */
  let activeStepIndex =
    -1;

  for (
    let index = 0;
    index <
    stepCount;
    index += 1
  ) {
    if (
      (
        state.stepProgresses[
          index
        ] ??
        0
      ) >
      0.001
    ) {
      activeStepIndex =
        index;
    }
  }

  for (
    let index = 0;
    index <
    stepCount;
    index += 1
  ) {
    const rawProgress =
      state.stepProgresses[
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
      activeStepIndex;

    const cardY =
      actualTopY +
      index *
        (
          cardHeight +
          connectorGap
        );

    const slideDirection =
      index %
        2 ===
      0
        ? -1
        : 1;

    const slideDistance =
      width *
      0.045;

    const offsetX =
      lerp(
        slideDirection *
          slideDistance,
        0,
        progress
      );

    const scale =
      lerp(
        0.965,
        1,
        progress
      );

    const drawX =
      cardX +
      offsetX;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      clamp01(
        rawProgress *
          1.25
      );

    context.translate(
      drawX +
        cardWidth /
          2,
      cardY +
        cardHeight /
          2
    );

    context.scale(
      scale,
      scale
    );

    context.translate(
      -(
        drawX +
        cardWidth /
          2
      ),
      -(
        cardY +
        cardHeight /
          2
      )
    );

    if (isActive) {
      context.shadowColor =
        "rgba(183, 255, 60, 0.18)";

      context.shadowBlur =
        width *
        0.03;
    }

    roundedRect(
      context,
      drawX,
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
      drawX,
      cardY,
      cardWidth,
      cardHeight,
      radius
    );

    context.strokeStyle =
      isActive
        ? "rgba(190, 242, 100, 0.62)"
        : "rgba(255,255,255,0.105)";

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
      STEP NUMBER
    */
    const numberX =
      drawX +
      cardWidth *
        0.105;

    const numberY =
      cardY +
      cardHeight /
        2;

    context.beginPath();

    context.arc(
      numberX,
      numberY,
      numberRadius,
      0,
      Math.PI *
        2
    );

    context.fillStyle =
      isActive
        ? "#b7ff3c"
        : "rgba(255,255,255,0.055)";

    context.fill();

    context.strokeStyle =
      isActive
        ? "rgba(190, 242, 100, 0.92)"
        : "rgba(255,255,255,0.11)";

    context.lineWidth =
      Math.max(
        1,
        width *
          0.0015
      );

    context.stroke();

    const numberSize =
      Math.max(
        22,
        Math.round(
          width *
            0.028
        )
      );

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.font =
      `900 ${numberSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      isActive
        ? "#081008"
        : "#7c899a";

    context.fillText(
      String(
        index +
          1
      ),
      numberX,
      numberY +
        1
    );

    /*
      TITLE + DETAIL
    */
    const contentX =
      drawX +
      cardWidth *
        0.19;

    const contentWidth =
      cardWidth *
        0.72;

    context.textAlign =
      "left";

    const cleanTitle =
      steps[
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
              0.044
          )
        ),
        Math.max(
          24,
          Math.round(
            width *
              0.028
          )
        ),
        contentWidth,
        2,
        900
      );

    const hasDetail =
      Boolean(
        steps[
          index
        ].detail?.trim()
      );

    const titleLineHeight =
      titleLayout.fontSize *
      1.02;

    const titleBaseY =
      hasDetail
        ? cardY +
          cardHeight *
            0.39
        : cardY +
          cardHeight *
            0.50;

    const titleStartY =
      titleBaseY -
      (
        titleLayout.lines.length -
        1
      ) *
        titleLineHeight /
        2;

    context.font =
      `900 ${titleLayout.fontSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      isActive
        ? "#b7ff3c"
        : "#ffffff";

    context.shadowColor =
      "rgba(0,0,0,0.78)";

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

    const detail =
      steps[
        index
      ].detail?.trim();

    if (detail) {
      const detailLayout =
        fitWrappedText(
          context,
          detail.toLocaleUpperCase(
            "es-MX"
          ),
          Math.max(
            21,
            Math.round(
              width *
                0.024
            )
          ),
          Math.max(
            16,
            Math.round(
              width *
                0.018
            )
          ),
          contentWidth,
          1,
          700
        );

      context.font =
        `700 ${detailLayout.fontSize}px Arial, Helvetica, sans-serif`;

      context.fillStyle =
        "#7f8c9d";

      context.fillText(
        detailLayout.lines[
          0
        ] ??
          "",
        contentX,
        cardY +
          cardHeight *
            0.72
      );
    }

    context.restore();

    /*
      CONNECTOR BELOW THIS STEP
    */
    if (
      index <
      stepCount -
        1
    ) {
      const connectorProgress =
        easeOutCubic(
          state.connectorProgresses[
            index
          ] ??
          0
        );

      if (
        connectorProgress >
        0.001
      ) {
        const connectorTop =
          cardY +
          cardHeight;

        const connectorBottom =
          cardY +
          cardHeight +
          connectorGap;

        const connectorX =
          centerX;

        context.save();

        context.globalAlpha =
          sceneAlpha *
          connectorProgress;

        context.strokeStyle =
          "rgba(190, 242, 100, 0.52)";

        context.lineWidth =
          Math.max(
            2,
            width *
              0.002
          );

        context.beginPath();

        context.moveTo(
          connectorX,
          connectorTop +
            3
        );

        context.lineTo(
          connectorX,
          lerp(
            connectorTop +
              3,
            connectorBottom -
              3,
            connectorProgress
          )
        );

        context.stroke();

        context.restore();
      }
    }
  }

  context.restore();

  return canvasToPng(
    canvas
  );
}
