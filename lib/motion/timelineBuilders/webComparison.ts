import {
  createWebComparisonPng,
} from "@/lib/motion/templates/webComparison";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

export async function buildWebComparisonSegment({
  width,
  height,
  segmentIndex,
  segmentStart,
  segmentEnd,
  segment,
}: MotionSegmentBuildContext): Promise<MotionSegmentBuildResult> {
  if (segment.graphic.type !== "WEB_COMPARISON") {
    throw new Error(
      `Motion template mismatch: expected WEB_COMPARISON, received ${segment.graphic.type}.`
    );
  }

  const assets: MotionSegmentBuildResult["assets"] = [];
  const frames: MotionSegmentBuildResult["frames"] = [];

  const addFrame = (
    assetKey: string,
    frameDuration: number
  ) => {
    if (
      !Number.isFinite(frameDuration) ||
      frameDuration <= 0.001
    ) {
      return;
    }

    frames.push({
      assetKey,
      duration: frameDuration,
    });
  };

  const graphic = segment.graphic;
  const segmentDuration = segmentEnd - segmentStart;

  const introDuration = Math.min(
    0.28,
    Math.max(0.18, segmentDuration * 0.07),
    segmentDuration * 0.12
  );

  const leftDuration = Math.min(
    0.42,
    Math.max(0.24, segmentDuration * 0.10),
    segmentDuration * 0.16
  );

  const leftNotesDuration = Math.min(
    0.36,
    Math.max(0.20, segmentDuration * 0.08),
    segmentDuration * 0.13
  );

  const dividerDuration = Math.min(
    0.16,
    Math.max(0.10, segmentDuration * 0.035),
    segmentDuration * 0.07
  );

  const rightDuration = Math.min(
    0.42,
    Math.max(0.24, segmentDuration * 0.10),
    segmentDuration * 0.16
  );

  const rightNotesDuration = Math.min(
    0.36,
    Math.max(0.20, segmentDuration * 0.08),
    segmentDuration * 0.13
  );

  const outroDuration = Math.min(
    0.20,
    Math.max(0.12, segmentDuration * 0.05),
    segmentDuration * 0.10
  );

  let phaseCursor = segmentStart;

  type State = {
    introProgress: number;
    leftProgress: number;
    leftNotesProgress: number;
    dividerProgress: number;
    rightProgress: number;
    rightNotesProgress: number;
    exitProgress: number;
  };

  async function addAnimated(
    keyPrefix: string,
    phaseDuration: number,
    steps: number,
    buildState: (progress: number) => State
  ) {
    if (phaseDuration <= 0.001 || steps <= 0) {
      return;
    }

    for (let step = 0; step < steps; step += 1) {
      const progress = (step + 1) / steps;
      const key =
        `segment-${segmentIndex}-web-comparison-${keyPrefix}-${step}`;

      assets.push({
        key,
        data: await createWebComparisonPng(
          width,
          height,
          graphic,
          buildState(progress)
        ),
      });

      addFrame(key, phaseDuration / steps);
    }

    phaseCursor += phaseDuration;
  }

  async function addStatic(
    keySuffix: string,
    frameDuration: number,
    state: State
  ) {
    if (frameDuration <= 0.001) {
      return;
    }

    const key =
      `segment-${segmentIndex}-web-comparison-${keySuffix}`;

    assets.push({
      key,
      data: await createWebComparisonPng(
        width,
        height,
        graphic,
        state
      ),
    });

    addFrame(key, frameDuration);
    phaseCursor += frameDuration;
  }

  const fullState: State = {
    introProgress: 1,
    leftProgress: 1,
    leftNotesProgress: 1,
    dividerProgress: 1,
    rightProgress: 1,
    rightNotesProgress: 1,
    exitProgress: 0,
  };

  await addAnimated(
    "intro",
    introDuration,
    segmentDuration >= 1 ? 5 : 3,
    (progress) => ({
      introProgress: progress,
      leftProgress: 0,
      leftNotesProgress: 0,
      dividerProgress: 0,
      rightProgress: 0,
      rightNotesProgress: 0,
      exitProgress: 0,
    })
  );

  await addAnimated(
    "left",
    leftDuration,
    segmentDuration >= 1 ? 6 : 3,
    (progress) => ({
      introProgress: 1,
      leftProgress: progress,
      leftNotesProgress: 0,
      dividerProgress: 0,
      rightProgress: 0,
      rightNotesProgress: 0,
      exitProgress: 0,
    })
  );

  await addAnimated(
    "left-notes",
    leftNotesDuration,
    5,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      leftNotesProgress: progress,
      dividerProgress: 0,
      rightProgress: 0,
      rightNotesProgress: 0,
      exitProgress: 0,
    })
  );

  await addAnimated(
    "divider",
    dividerDuration,
    3,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      leftNotesProgress: 1,
      dividerProgress: progress,
      rightProgress: 0,
      rightNotesProgress: 0,
      exitProgress: 0,
    })
  );

  await addAnimated(
    "right",
    rightDuration,
    segmentDuration >= 1 ? 6 : 3,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      leftNotesProgress: 1,
      dividerProgress: 1,
      rightProgress: progress,
      rightNotesProgress: 0,
      exitProgress: 0,
    })
  );

  await addAnimated(
    "right-notes",
    rightNotesDuration,
    5,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      leftNotesProgress: 1,
      dividerProgress: 1,
      rightProgress: 1,
      rightNotesProgress: progress,
      exitProgress: 0,
    })
  );

  const plannedDuration =
    phaseCursor - segmentStart + outroDuration;

  const holdDuration = Math.max(
    0,
    segmentDuration - plannedDuration
  );

  await addStatic(
    "hold",
    holdDuration,
    fullState
  );

  await addAnimated(
    "outro",
    Math.min(
      outroDuration,
      Math.max(0, segmentEnd - phaseCursor)
    ),
    segmentDuration >= 1 ? 4 : 2,
    (progress) => ({
      ...fullState,
      exitProgress: progress,
    })
  );

  // Si el segmento es extremadamente corto y quedó una fracción
  // sin cubrir, mantenemos el último estado para preservar duración.
  const remainder = segmentEnd - phaseCursor;

  if (remainder > 0.001) {
    await addStatic(
      "tail",
      remainder,
      fullState
    );
  }

  return {
    assets,
    frames,
  };
}
