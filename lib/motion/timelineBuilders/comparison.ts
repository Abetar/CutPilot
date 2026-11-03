import {
  createComparisonPng,
} from "@/lib/motion/templates/comparison";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

import {
  clamp,
} from "@/lib/motion/timelineBuilders/types";

export async function buildComparisonSegment({
  width,
  height,
  segmentIndex,
  segmentStart,
  segmentEnd,
  segment,
}: MotionSegmentBuildContext): Promise<MotionSegmentBuildResult> {
  if (segment.graphic.type !== "COMPARISON") {
    throw new Error(
      `Motion template mismatch: expected COMPARISON, received ${segment.graphic.type}.`
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

  const segmentDuration =
    segmentEnd -
    segmentStart;

  const graphic =
    segment.graphic;

  const introDuration =
    Math.min(
      0.34,
      Math.max(
        0.22,
        segmentDuration *
          0.11
      ),
      segmentDuration *
        0.22
    );

  const leftDuration =
    Math.min(
      0.34,
      Math.max(
        0.22,
        segmentDuration *
          0.10
      ),
      segmentDuration *
        0.18
    );

  const dividerDuration =
    Math.min(
      0.16,
      Math.max(
        0.10,
        segmentDuration *
          0.045
      ),
      segmentDuration *
        0.10
    );

  const rightDuration =
    Math.min(
      0.34,
      Math.max(
        0.22,
        segmentDuration *
          0.10
      ),
      segmentDuration *
        0.18
    );

  const emphasisDuration =
    graphic.emphasis ===
      "NEUTRAL"
      ? 0
      : Math.min(
          0.22,
          Math.max(
            0.14,
            segmentDuration *
              0.06
          ),
          segmentDuration *
            0.12
        );

  const outroDuration =
    Math.min(
      0.22,
      Math.max(
        0.12,
        segmentDuration *
          0.07
      ),
      segmentDuration *
        0.16
    );

  const introEnd =
    segmentStart +
    introDuration;

  const leftEnd =
    introEnd +
    leftDuration;

  const outroStart =
    Math.max(
      leftEnd,
      segmentEnd -
        outroDuration
    );

  const preferredRightStart =
    segment.secondaryRevealAt !==
      null &&
    segment.secondaryRevealAt !==
      undefined
      ? segment.secondaryRevealAt -
        0.06
      : segmentStart +
        segmentDuration *
          0.53;

  const earliestRightStart =
    leftEnd +
    dividerDuration;

  const latestRightStart =
    Math.max(
      earliestRightStart,
      outroStart -
        rightDuration -
        emphasisDuration
    );

  const rightStart =
    clamp(
      preferredRightStart,
      earliestRightStart,
      latestRightStart
    );

  const dividerStart =
    Math.max(
      leftEnd,
      rightStart -
        dividerDuration
    );

  let phaseCursor =
    segmentStart;

  async function addComparisonAnimatedState(
    keyPrefix: string,
    phaseDuration: number,
    steps: number,
    buildState: (
      progress: number
    ) => {
      introProgress: number;
      leftProgress: number;
      dividerProgress: number;
      rightProgress: number;
      emphasisProgress: number;
      exitProgress: number;
    }
  ) {
    if (
      phaseDuration <=
        0.001 ||
      steps <=
        0
    ) {
      return;
    }

    for (
      let step = 0;
      step <
      steps;
      step += 1
    ) {
      const progress =
        (step + 1) /
        steps;

      const key =
        `segment-${segmentIndex}-comparison-${keyPrefix}-${step}`;

      assets.push({
        key,

        data:
          await createComparisonPng(
            width,
            height,
            graphic,
            buildState(
              progress
            )
          ),
      });

      addFrame(
        key,
        phaseDuration /
          steps
      );
    }

    phaseCursor +=
      phaseDuration;
  }

  async function addComparisonStaticState(
    keySuffix: string,
    frameDuration: number,
    state: {
      introProgress: number;
      leftProgress: number;
      dividerProgress: number;
      rightProgress: number;
      emphasisProgress: number;
      exitProgress: number;
    }
  ) {
    if (
      frameDuration <=
      0.001
    ) {
      return;
    }

    const key =
      `segment-${segmentIndex}-comparison-${keySuffix}`;

    assets.push({
      key,

      data:
        await createComparisonPng(
          width,
          height,
          graphic,
          state
        ),
    });

    addFrame(
      key,
      frameDuration
    );

    phaseCursor +=
      frameDuration;
  }

  /*
    1. Fondo + label
  */
  await addComparisonAnimatedState(
    "intro",
    introDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      introProgress:
        progress,

      leftProgress: 0,
      dividerProgress: 0,
      rightProgress: 0,
      emphasisProgress: 0,
      exitProgress: 0,
    })
  );

  /*
    2. Lado A
  */
  await addComparisonAnimatedState(
    "left",
    leftDuration,
    segmentDuration >=
      1
      ? 6
      : 3,
    (progress) => ({
      introProgress: 1,

      leftProgress:
        progress,

      dividerProgress: 0,
      rightProgress: 0,
      emphasisProgress: 0,
      exitProgress: 0,
    })
  );

  /*
    3. Hold del lado A hasta acercarnos al lado B.
  */
  await addComparisonStaticState(
    "left-hold",
    Math.max(
      0,
      dividerStart -
        phaseCursor
    ),
    {
      introProgress: 1,
      leftProgress: 1,
      dividerProgress: 0,
      rightProgress: 0,
      emphasisProgress: 0,
      exitProgress: 0,
    }
  );

  /*
    4. VS badge.
  */
  const realDividerDuration =
    Math.max(
      0,
      Math.min(
        dividerDuration,
        rightStart -
          phaseCursor
      )
    );

  await addComparisonAnimatedState(
    "divider",
    realDividerDuration,
    segmentDuration >=
      1
      ? 4
      : 2,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,

      dividerProgress:
        progress,

      rightProgress: 0,
      emphasisProgress: 0,
      exitProgress: 0,
    })
  );

  /*
    Si queda hueco por la sincronización verbal,
    mantenemos A + VS antes de revelar B.
  */
  await addComparisonStaticState(
    "divider-hold",
    Math.max(
      0,
      rightStart -
        phaseCursor
    ),
    {
      introProgress: 1,
      leftProgress: 1,
      dividerProgress: 1,
      rightProgress: 0,
      emphasisProgress: 0,
      exitProgress: 0,
    }
  );

  /*
    5. Lado B, sincronizado cuando es posible.
  */
  const realRightDuration =
    Math.max(
      0,
      Math.min(
        rightDuration,
        outroStart -
          emphasisDuration -
          phaseCursor
      )
    );

  await addComparisonAnimatedState(
    "right",
    realRightDuration,
    segmentDuration >=
      1
      ? 6
      : 3,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      dividerProgress: 1,

      rightProgress:
        progress,

      emphasisProgress: 0,
      exitProgress: 0,
    })
  );

  /*
    6. Si la narración favorece un lado,
    el highlight aparece DESPUÉS de mostrar ambos.
  */
  if (
    emphasisDuration >
    0
  ) {
    const realEmphasisDuration =
      Math.max(
        0,
        Math.min(
          emphasisDuration,
          outroStart -
            phaseCursor
        )
      );

    await addComparisonAnimatedState(
      "emphasis",
      realEmphasisDuration,
      segmentDuration >=
        1
        ? 5
        : 3,
      (progress) => ({
        introProgress: 1,
        leftProgress: 1,
        dividerProgress: 1,
        rightProgress: 1,

        emphasisProgress:
          progress,

        exitProgress: 0,
      })
    );
  }

  /*
    7. Comparación completa.
  */
  await addComparisonStaticState(
    "complete-hold",
    Math.max(
      0,
      outroStart -
        phaseCursor
    ),
    {
      introProgress: 1,
      leftProgress: 1,
      dividerProgress: 1,
      rightProgress: 1,

      emphasisProgress:
        graphic.emphasis ===
          "NEUTRAL"
          ? 0
          : 1,

      exitProgress: 0,
    }
  );

  /*
    8. Salida.
  */
  const remainingOutroDuration =
    Math.max(
      0,
      segmentEnd -
        phaseCursor
    );

  await addComparisonAnimatedState(
    "outro",
    remainingOutroDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      introProgress: 1,
      leftProgress: 1,
      dividerProgress: 1,
      rightProgress: 1,

      emphasisProgress:
        graphic.emphasis ===
          "NEUTRAL"
          ? 0
          : 1,

      exitProgress:
        progress,
    })
  );

  return {
    assets,
    frames,
  };
}
