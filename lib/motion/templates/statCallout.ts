import type {
  StatCalloutMotionGraphicRequest,
} from "@/lib/motion/types";

type StatCalloutFrameState = {
  /*
    Entrada general de la escena:
    fondo + label + primary.
  */
  introProgress: number;

  /*
    Transición que prepara el cambio:
    mueve/reduce ligeramente el primary
    y dibuja el conector.
  */
  connectorProgress: number;

  /*
    Reveal independiente del valor secundario.
  */
  secondaryProgress: number;

  /*
    Salida completa de la escena.
  */
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
    1.70158;

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
      4;
  }

  return fontSize;
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
                  "No se pudo generar el frame de Motion Graphics."
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

export async function createTransparentMotionPng(
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

  return canvasToPng(
    canvas
  );
}

export async function createStatCalloutPng(
  width: number,
  height: number,
  graphic: StatCalloutMotionGraphicRequest,
  state: StatCalloutFrameState
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
      "No se pudo crear el Canvas de STAT_CALLOUT."
    );
  }

  const intro =
    easeOutCubic(
      state.introProgress
    );

  const connector =
    easeOutCubic(
      state.connectorProgress
    );

  const secondary =
    easeOutBack(
      state.secondaryProgress
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

  const hasSecondary =
    Boolean(
      graphic.secondary?.trim()
    );

  /*
    ========================================
    BACKGROUND
    ========================================

    Sigue siendo full-screen para que la escena
    se sienta editorial, pero ahora entra primero
    y el contenido se construye encima.
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
      height * 0.55,
      0,
      centerX,
      height * 0.55,
      Math.max(
        width * 0.72,
        height * 0.34
      )
    );

  glow.addColorStop(
    0,
    "rgba(190, 242, 100, 0.10)"
  );

  glow.addColorStop(
    0.46,
    "rgba(190, 242, 100, 0.025)"
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

  /*
    Línea superior:
    crece desde el centro durante el intro.
  */
  const topLineHalfWidth =
    width *
    0.38 *
    intro;

  context.strokeStyle =
    "rgba(190, 242, 100, 0.13)";

  context.lineWidth =
    Math.max(
      1,
      width * 0.0015
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
    La salida aplica una transformación muy ligera
    a toda la composición. El movimiento importante
    ocurre antes, cuando llega el valor secundario.
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

  context.textAlign =
    "center";

  context.textBaseline =
    "middle";

  /*
    ========================================
    LABEL
    ========================================
  */
  if (
    graphic.label?.trim()
  ) {
    const labelReveal =
      easeOutCubic(
        clamp01(
          state.introProgress /
          0.62
        )
      );

    context.save();

    context.globalAlpha =
      sceneAlpha *
      labelReveal;

    const labelSize =
      Math.max(
        24,
        Math.round(
          width * 0.035
        )
      );

    context.font =
      `800 ${labelSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      "#75839a";

    context.shadowColor =
      "rgba(0, 0, 0, 0.75)";

    context.shadowBlur =
      Math.max(
        6,
        labelSize * 0.18
      );

    context.fillText(
      graphic.label
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        ),
      centerX,
      height *
        (hasSecondary
          ? 0.34
          : 0.41)
    );

    context.restore();
  }

  /*
    ========================================
    PRIMARY
    ========================================

    Primero aparece como protagonista.

    Cuando empieza la transformación:
    - sube
    - se reduce ligeramente

    Eso deja espacio para el secondary y comunica
    visualmente "antes -> ahora".
  */
  const primaryReveal =
    easeOutCubic(
      clamp01(
        (
          state.introProgress -
          0.16
        ) /
        0.84
      )
    );

  const transformProgress =
    hasSecondary
      ? Math.max(
          connector,
          clamp01(
            state.secondaryProgress
          ) * 0.92
        )
      : 0;

  const primaryText =
    graphic.primary
      .trim()
      .toLocaleUpperCase(
        "es-MX"
      );

  const primaryBaseSize =
    fitFontSize(
      context,
      primaryText,
      Math.max(
        74,
        Math.round(
          width * 0.132
        )
      ),
      Math.max(
        46,
        Math.round(
          width * 0.07
        )
      ),
      width * 0.84,
      900
    );

  const primaryEntryScale =
    lerp(
      0.90,
      1,
      primaryReveal
    );

  const primaryTransformScale =
    lerp(
      1,
      0.90,
      transformProgress
    );

  const primaryScale =
    primaryEntryScale *
    primaryTransformScale;

  const primaryStartY =
    height *
    (hasSecondary
      ? 0.50
      : 0.515);

  const primaryEndY =
    height * 0.435;

  const primaryY =
    hasSecondary
      ? lerp(
          primaryStartY,
          primaryEndY,
          transformProgress
        )
      : primaryStartY;

  context.save();

  context.globalAlpha =
    sceneAlpha *
    primaryReveal;

  context.translate(
    centerX,
    primaryY
  );

  context.scale(
    primaryScale,
    primaryScale
  );

  context.font =
    `900 ${primaryBaseSize}px Arial, Helvetica, sans-serif`;

  context.fillStyle =
    "#ffffff";

  context.shadowColor =
    "rgba(0, 0, 0, 0.88)";

  context.shadowBlur =
    Math.max(
      10,
      primaryBaseSize * 0.12
    );

  context.fillText(
    primaryText,
    0,
    0
  );

  context.restore();

  if (hasSecondary) {
    /*
      ========================================
      CONNECTOR
      ========================================

      Primero mueve/reduce el primary y luego
      construye el conector. La línea horizontal
      crece desde el centro para conservar el look
      original de la preview.
    */
    context.save();

    context.globalAlpha =
      sceneAlpha *
      connector;

    context.strokeStyle =
      "rgba(190, 242, 100, 0.56)";

    context.fillStyle =
      "#bef264";

    context.lineWidth =
      Math.max(
        2,
        width * 0.002
      );

    const arrowY =
      height * 0.515;

    const lineGap =
      width * 0.035;

    const lineLength =
      width *
      0.10 *
      connector;

    context.beginPath();

    context.moveTo(
      centerX -
        lineGap -
        lineLength,
      arrowY
    );

    context.lineTo(
      centerX -
        lineGap,
      arrowY
    );

    context.moveTo(
      centerX +
        lineGap,
      arrowY
    );

    context.lineTo(
      centerX +
        lineGap +
        lineLength,
      arrowY
    );

    context.stroke();

    const arrowSize =
      Math.max(
        28,
        Math.round(
          width * 0.035
        )
      );

    context.font =
      `900 ${arrowSize}px Arial, Helvetica, sans-serif`;

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.translate(
      0,
      (1 - connector) *
        -height *
        0.008
    );

    context.fillText(
      "↓",
      centerX,
      arrowY
    );

    context.restore();

    /*
      ========================================
      SECONDARY
      ========================================

      Entra después del connector con un pop
      corto y controlado.

      El pequeño overshoot es suficiente para
      sentirse animado sin convertirse en un
      efecto de gaming/meme.
    */
    const secondaryText =
      graphic.secondary!
        .trim()
        .toLocaleUpperCase(
          "es-MX"
        );

    const secondaryBaseSize =
      fitFontSize(
        context,
        secondaryText,
        Math.max(
          80,
          Math.round(
            width * 0.142
          )
        ),
        Math.max(
          48,
          Math.round(
            width * 0.072
          )
        ),
        width * 0.84,
        900
      );

    const secondaryScale =
      lerp(
        0.84,
        1,
        secondary
      );

    const secondaryY =
      height *
      0.595 +
      (1 -
        clamp01(
          state.secondaryProgress
        )) *
        height *
        0.015;

    context.save();

    context.globalAlpha =
      sceneAlpha *
      clamp01(
        state.secondaryProgress *
        1.25
      );

    context.translate(
      centerX,
      secondaryY
    );

    context.scale(
      secondaryScale,
      secondaryScale
    );

    context.font =
      `900 ${secondaryBaseSize}px Arial, Helvetica, sans-serif`;

    context.fillStyle =
      "#b7ff3c";

    context.shadowColor =
      "rgba(183, 255, 60, 0.28)";

    context.shadowBlur =
      Math.max(
        14,
        secondaryBaseSize * 0.18
      );

    context.fillText(
      secondaryText,
      0,
      0
    );

    context.restore();
  }

  context.restore();

  return canvasToPng(
    canvas
  );
}
