import type {
  WebComparisonMotionGraphicRequest,
} from "@/lib/motion/types";

export type WebComparisonFrameState = {
  introProgress: number;
  leftProgress: number;
  leftNotesProgress: number;
  dividerProgress: number;
  rightProgress: number;
  rightNotesProgress: number;
  exitProgress: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(
  start: number,
  end: number,
  progress: number
) {
  return start + (end - start) * clamp01(progress);
}

function easeOutCubic(value: number) {
  const p = clamp01(value);
  return 1 - Math.pow(1 - p, 3);
}

function easeOutBack(value: number) {
  const p = clamp01(value);
  const c1 = 1.18;
  const c3 = c1 + 1;

  return (
    1 +
    c3 * Math.pow(p - 1, 3) +
    c1 * Math.pow(p - 1, 2)
  );
}

function easeInCubic(value: number) {
  const p = clamp01(value);
  return p * p * p;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (
      !current ||
      context.measureText(candidate).width <= maxWidth
    ) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawWrappedText({
  context,
  text,
  x,
  y,
  maxWidth,
  maxLines,
  initialSize,
  minimumSize,
  lineHeightScale = 1.02,
}: {
  context: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  maxLines: number;
  initialSize: number;
  minimumSize: number;
  lineHeightScale?: number;
}) {
  let size = initialSize;
  let lines: string[] = [];

  while (size >= minimumSize) {
    context.font = `900 ${size}px Arial, Helvetica, sans-serif`;
    lines = wrapText(context, text, maxWidth);

    if (lines.length <= maxLines) {
      break;
    }

    size -= 2;
  }

  lines = lines.slice(0, maxLines);

  if (lines.length === maxLines) {
    const joined = lines.join(" ");
    const original = text.trim().replace(/\s+/g, " ");

    if (joined !== original) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+$/, "")}…`;
    }
  }

  const lineHeight = size * lineHeightScale;

  lines.forEach((line, index) => {
    context.fillText(line, x, y + lineHeight * index);
  });

  return {
    fontSize: size,
    lineCount: lines.length,
    height: Math.max(size, lines.length * lineHeight),
  };
}

function drawBrowserChrome(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  alpha: number
) {
  context.save();
  context.globalAlpha *= alpha;

  context.shadowColor = "rgba(0,0,0,0.34)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 14;
  context.fillStyle = "rgba(17, 20, 27, 0.98)";
  roundedRect(context, x, y, width, height, radius);
  context.fill();

  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(255,255,255,0.10)";
  context.lineWidth = 2;
  roundedRect(context, x, y, width, height, radius);
  context.stroke();

  const chromeHeight = height * 0.105;

  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();
  context.fillStyle = "rgba(255,255,255,0.045)";
  context.fillRect(x, y, width, chromeHeight);
  context.restore();

  const dotY = y + chromeHeight / 2;
  const dotRadius = Math.max(4, width * 0.0065);
  const dotStart = x + width * 0.045;

  [0, 1, 2].forEach((index) => {
    context.beginPath();
    context.fillStyle =
      index === 0
        ? "rgba(248,113,113,0.72)"
        : index === 1
          ? "rgba(250,204,21,0.72)"
          : "rgba(74,222,128,0.72)";
    context.arc(
      dotStart + index * dotRadius * 2.7,
      dotY,
      dotRadius,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  const addressX = x + width * 0.18;
  const addressWidth = width * 0.60;
  const addressHeight = chromeHeight * 0.42;

  context.fillStyle = "rgba(255,255,255,0.055)";
  roundedRect(
    context,
    addressX,
    dotY - addressHeight / 2,
    addressWidth,
    addressHeight,
    addressHeight / 2
  );
  context.fill();

  context.restore();

  return chromeHeight;
}

function drawBadWebsite({
  context,
  x,
  y,
  width,
  height,
  headline,
  progress,
}: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
  headline: string;
  progress: number;
}) {
  const p = easeOutCubic(progress);
  const offsetX = lerp(-width * 0.08, 0, p);
  const alpha = p;

  context.save();
  context.translate(offsetX, 0);
  context.globalAlpha *= alpha;

  const chromeHeight = drawBrowserChrome(
    context,
    x,
    y,
    width,
    height,
    width * 0.035,
    1
  );

  const contentY = y + chromeHeight;
  const contentHeight = height - chromeHeight;

  context.save();
  roundedRect(
    context,
    x,
    contentY,
    width,
    contentHeight,
    width * 0.028
  );
  context.clip();

  const gradient = context.createLinearGradient(
    x,
    contentY,
    x + width,
    contentY + contentHeight
  );
  gradient.addColorStop(0, "#24132e");
  gradient.addColorStop(0.55, "#171925");
  gradient.addColorStop(1, "#242025");
  context.fillStyle = gradient;
  context.fillRect(x, contentY, width, contentHeight);

  // Navegación deliberadamente ruidosa.
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.font = `900 ${Math.max(11, width * 0.030)}px Arial, Helvetica, sans-serif`;
  context.fillText("BRAND", x + width * 0.055, contentY + contentHeight * 0.10);

  const navY = contentY + contentHeight * 0.095;
  const navXs = [0.50, 0.62, 0.74, 0.86];
  navXs.forEach((position, index) => {
    context.fillStyle =
      index % 2 === 0
        ? "rgba(244,114,182,0.78)"
        : "rgba(167,139,250,0.78)";
    context.beginPath();
    context.arc(
      x + width * position,
      navY,
      width * 0.018,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  // Hero pesado.
  context.fillStyle = "#ffffff";
  context.textBaseline = "top";
  const headlineResult = drawWrappedText({
    context,
    text: headline.toUpperCase(),
    x: x + width * 0.055,
    y: contentY + contentHeight * 0.19,
    maxWidth: width * 0.68,
    maxLines: 3,
    initialSize: width * 0.075,
    minimumSize: width * 0.046,
    lineHeightScale: 0.90,
  });

  const afterHeadline =
    contentY +
    contentHeight * 0.19 +
    headlineResult.height +
    contentHeight * 0.035;

  // Texto falso en exceso.
  context.fillStyle = "rgba(255,255,255,0.44)";
  const lineHeights = [0.76, 0.64, 0.71, 0.47];
  lineHeights.forEach((fraction, index) => {
    context.fillRect(
      x + width * 0.055,
      afterHeadline + index * contentHeight * 0.045,
      width * fraction,
      Math.max(4, contentHeight * 0.013)
    );
  });

  // Muchos CTA peleando.
  const buttonY = afterHeadline + contentHeight * 0.20;
  const buttonData = [
    { x: 0.055, w: 0.26, color: "#f472b6" },
    { x: 0.33, w: 0.24, color: "#8b5cf6" },
    { x: 0.59, w: 0.30, color: "#22d3ee" },
  ];

  buttonData.forEach((button) => {
    context.fillStyle = button.color;
    roundedRect(
      context,
      x + width * button.x,
      buttonY,
      width * button.w,
      contentHeight * 0.085,
      contentHeight * 0.026
    );
    context.fill();
  });

  // Íconos decorativos compitiendo por atención.
  const iconPoints = [
    [0.13, 0.83],
    [0.25, 0.77],
    [0.40, 0.84],
    [0.56, 0.76],
    [0.69, 0.84],
    [0.84, 0.76],
  ];

  iconPoints.forEach(([px, py], index) => {
    const radius = width * (index % 2 === 0 ? 0.035 : 0.027);
    context.beginPath();
    context.fillStyle =
      index % 3 === 0
        ? "rgba(244,114,182,0.72)"
        : index % 3 === 1
          ? "rgba(34,211,238,0.72)"
          : "rgba(167,139,250,0.72)";
    context.arc(
      x + width * px,
      contentY + contentHeight * py,
      radius,
      0,
      Math.PI * 2
    );
    context.fill();

    context.strokeStyle = "rgba(255,255,255,0.50)";
    context.lineWidth = Math.max(2, width * 0.004);
    context.beginPath();
    context.moveTo(
      x + width * px - radius * 0.45,
      contentY + contentHeight * py
    );
    context.lineTo(
      x + width * px + radius * 0.45,
      contentY + contentHeight * py
    );
    context.stroke();
  });

  // Elementos extra flotantes.
  context.fillStyle = "rgba(250,204,21,0.85)";
  roundedRect(
    context,
    x + width * 0.76,
    contentY + contentHeight * 0.27,
    width * 0.17,
    contentHeight * 0.16,
    width * 0.02
  );
  context.fill();

  context.restore();
  context.restore();
}

function drawGoodWebsite({
  context,
  x,
  y,
  width,
  height,
  headline,
  cta,
  progress,
}: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
  headline: string;
  cta: string | null;
  progress: number;
}) {
  const p = easeOutCubic(progress);
  const offsetX = lerp(width * 0.08, 0, p);
  const alpha = p;

  context.save();
  context.translate(offsetX, 0);
  context.globalAlpha *= alpha;

  const chromeHeight = drawBrowserChrome(
    context,
    x,
    y,
    width,
    height,
    width * 0.035,
    1
  );

  const contentY = y + chromeHeight;
  const contentHeight = height - chromeHeight;

  context.save();
  roundedRect(
    context,
    x,
    contentY,
    width,
    contentHeight,
    width * 0.028
  );
  context.clip();

  const gradient = context.createLinearGradient(
    x,
    contentY,
    x + width,
    contentY + contentHeight
  );
  gradient.addColorStop(0, "#081b21");
  gradient.addColorStop(0.58, "#0b1720");
  gradient.addColorStop(1, "#10131c");
  context.fillStyle = gradient;
  context.fillRect(x, contentY, width, contentHeight);

  // Nav limpia.
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.font = `900 ${Math.max(11, width * 0.030)}px Arial, Helvetica, sans-serif`;
  context.fillText("BRAND", x + width * 0.055, contentY + contentHeight * 0.10);

  context.fillStyle = "rgba(255,255,255,0.38)";
  [0.63, 0.74].forEach((position, index) => {
    context.fillRect(
      x + width * position,
      contentY + contentHeight * (0.09 + index * 0.001),
      width * 0.075,
      Math.max(4, contentHeight * 0.012)
    );
  });

  // Hero enfocado.
  const leftX = x + width * 0.055;
  const heroTop = contentY + contentHeight * 0.22;
  const heroWidth = width * 0.52;

  context.fillStyle = "#ffffff";
  context.textBaseline = "top";
  const headlineResult = drawWrappedText({
    context,
    text: headline.toUpperCase(),
    x: leftX,
    y: heroTop,
    maxWidth: heroWidth,
    maxLines: 3,
    initialSize: width * 0.064,
    minimumSize: width * 0.044,
    lineHeightScale: 0.95,
  });

  const copyTop = heroTop + headlineResult.height + contentHeight * 0.035;

  context.fillStyle = "rgba(255,255,255,0.40)";
  [0.45, 0.38].forEach((fraction, index) => {
    context.fillRect(
      leftX,
      copyTop + index * contentHeight * 0.045,
      width * fraction,
      Math.max(4, contentHeight * 0.012)
    );
  });

  const buttonTop = copyTop + contentHeight * 0.13;
  const buttonWidth = width * 0.32;
  const buttonHeight = contentHeight * 0.095;
  context.fillStyle = "#84cc16";
  roundedRect(
    context,
    leftX,
    buttonTop,
    buttonWidth,
    buttonHeight,
    buttonHeight * 0.28
  );
  context.fill();

  context.fillStyle = "#10130b";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.max(10, width * 0.024)}px Arial, Helvetica, sans-serif`;
  context.fillText(
    (cta?.trim() || "CTA PRINCIPAL").toUpperCase(),
    leftX + buttonWidth / 2,
    buttonTop + buttonHeight / 2,
    buttonWidth * 0.84
  );

  // Un solo visual dominante.
  const visualX = x + width * 0.65;
  const visualY = contentY + contentHeight * 0.22;
  const visualW = width * 0.28;
  const visualH = contentHeight * 0.58;

  const visualGradient = context.createLinearGradient(
    visualX,
    visualY,
    visualX + visualW,
    visualY + visualH
  );
  visualGradient.addColorStop(0, "rgba(34,211,238,0.65)");
  visualGradient.addColorStop(1, "rgba(132,204,22,0.50)");
  context.fillStyle = visualGradient;
  roundedRect(
    context,
    visualX,
    visualY,
    visualW,
    visualH,
    width * 0.035
  );
  context.fill();

  context.fillStyle = "rgba(255,255,255,0.22)";
  for (let index = 0; index < 3; index += 1) {
    roundedRect(
      context,
      visualX + visualW * 0.16,
      visualY + visualH * (0.18 + index * 0.22),
      visualW * (index === 1 ? 0.68 : 0.54),
      visualH * 0.08,
      visualH * 0.03
    );
    context.fill();
  }

  context.restore();
  context.restore();
}

function drawNotes({
  context,
  items,
  x,
  y,
  maxWidth,
  progress,
  positive,
  scale,
}: {
  context: CanvasRenderingContext2D;
  items: string[];
  x: number;
  y: number;
  maxWidth: number;
  progress: number;
  positive: boolean;
  scale: number;
}) {
  const visibleItems = items.slice(0, 3);
  const chipHeight = 52 * scale;
  const gap = 14 * scale;

  visibleItems.forEach((item, index) => {
    const localProgress = clamp01(
      progress * visibleItems.length - index
    );

    if (localProgress <= 0.001) {
      return;
    }

    const p = easeOutBack(localProgress);
    const chipY = y + index * (chipHeight + gap);
    const offset = lerp(28 * scale, 0, p);

    context.save();
    context.globalAlpha *= localProgress;
    context.translate(offset, 0);

    context.font = `800 ${22 * scale}px Arial, Helvetica, sans-serif`;
    const text = item.trim().toUpperCase();
    const measured = Math.min(
      maxWidth,
      context.measureText(text).width + 78 * scale
    );

    context.fillStyle = positive
      ? "rgba(132,204,22,0.13)"
      : "rgba(248,113,113,0.13)";
    context.strokeStyle = positive
      ? "rgba(163,230,53,0.40)"
      : "rgba(248,113,113,0.40)";
    context.lineWidth = 2 * scale;

    roundedRect(
      context,
      x,
      chipY,
      measured,
      chipHeight,
      16 * scale
    );
    context.fill();
    context.stroke();

    context.fillStyle = positive ? "#bef264" : "#fca5a5";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${22 * scale}px Arial, Helvetica, sans-serif`;
    context.fillText(
      positive ? "✓" : "×",
      x + 26 * scale,
      chipY + chipHeight / 2
    );

    context.fillStyle = "rgba(255,255,255,0.90)";
    context.textAlign = "left";
    context.font = `800 ${20 * scale}px Arial, Helvetica, sans-serif`;
    context.fillText(
      text,
      x + 48 * scale,
      chipY + chipHeight / 2,
      measured - 62 * scale
    );

    context.restore();
  });
}

async function canvasToPng(
  canvas: HTMLCanvasElement
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(
          new Error(
            "No se pudo generar el frame WEB_COMPARISON."
          )
        );
        return;
      }

      resolve(result);
    }, "image/png");
  });

  return new Uint8Array(await blob.arrayBuffer());
}

export async function createWebComparisonPng(
  width: number,
  height: number,
  graphic: WebComparisonMotionGraphicRequest,
  state: WebComparisonFrameState
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "No se pudo crear Canvas para WEB_COMPARISON."
    );
  }

  const sx = width / 1080;
  const sy = height / 1920;
  const scale = Math.min(sx, sy);

  const intro = easeOutCubic(state.introProgress);
  const exit = easeInCubic(state.exitProgress);
  const sceneAlpha = clamp01(intro * (1 - exit));
  const sceneScale = lerp(0.975, 1, intro) * lerp(1, 0.985, exit);

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalAlpha = sceneAlpha;
  context.translate(width / 2, height / 2);
  context.scale(sceneScale, sceneScale);
  context.translate(-width / 2, -height / 2);

  const background = context.createLinearGradient(
    0,
    0,
    width,
    height
  );
  background.addColorStop(0, "#07090f");
  background.addColorStop(0.50, "#0b0d14");
  background.addColorStop(1, "#071014");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  // Glow sutil de fondo.
  const glow = context.createRadialGradient(
    width * 0.50,
    height * 0.48,
    0,
    width * 0.50,
    height * 0.48,
    width * 0.70
  );
  glow.addColorStop(0, "rgba(139,92,246,0.10)");
  glow.addColorStop(0.55, "rgba(34,211,238,0.035)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const marginX = 58 * scale;
  const cardWidth = width - marginX * 2;
  const cardHeight = 440 * scale;
  const topY = 150 * scale;
  const bottomY = 1010 * scale;

  /*
    WEB_COMPARISON es visual-first:

    - no dibujamos label superior
    - no dibujamos título editorial
    - no dibujamos "SIN DIRECCIÓN" / "CON OBJETIVO"

    El audio + subtítulos cuentan la historia.
    El Motion Graphic sólo la ilustra.
  */
  context.textAlign = "left";
  context.textBaseline = "middle";

  const leftP = easeOutCubic(state.leftProgress);
  context.globalAlpha = sceneAlpha * leftP;

  drawBadWebsite({
    context,
    x: marginX,
    y: topY,
    width: cardWidth,
    height: cardHeight,
    headline: graphic.leftHeadline,
    progress: state.leftProgress,
  });

  context.globalAlpha = sceneAlpha;
  drawNotes({
    context,
    items: graphic.leftIssues,
    x: marginX,
    y: topY + cardHeight + 28 * scale,
    maxWidth: cardWidth * 0.94,
    progress: state.leftNotesProgress,
    positive: false,
    scale,
  });

  // Separador VS.
  const divider = easeOutBack(state.dividerProgress);
  context.save();
  context.globalAlpha = sceneAlpha * divider;
  const dividerY = 900 * scale;
  const dividerRadius = 42 * scale * divider;
  context.fillStyle = "rgba(255,255,255,0.08)";
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.lineWidth = 2 * scale;
  context.beginPath();
  context.arc(
    width / 2,
    dividerY,
    dividerRadius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${30 * scale}px Arial, Helvetica, sans-serif`;
  context.fillText("VS", width / 2, dividerY);
  context.restore();

  const rightP = easeOutCubic(state.rightProgress);
  context.globalAlpha = sceneAlpha * rightP;
  context.textAlign = "left";

  drawGoodWebsite({
    context,
    x: marginX,
    y: bottomY,
    width: cardWidth,
    height: cardHeight,
    headline: graphic.rightHeadline,
    cta: graphic.rightCta,
    progress: state.rightProgress,
  });

  context.globalAlpha = sceneAlpha;
  drawNotes({
    context,
    items: graphic.rightStrengths,
    x: marginX,
    y: bottomY + cardHeight + 28 * scale,
    maxWidth: cardWidth * 0.94,
    progress: state.rightNotesProgress,
    positive: true,
    scale,
  });

  context.restore();

  return canvasToPng(canvas);
}
