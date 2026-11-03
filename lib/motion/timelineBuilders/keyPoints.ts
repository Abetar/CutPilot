import {
  createKeyPointsPng,
} from "@/lib/motion/templates/keyPoints";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

import {
  clamp,
} from "@/lib/motion/timelineBuilders/types";

export async function buildKeyPointsSegment({
  width,
  height,
  segmentIndex,
  segmentStart,
  segmentEnd,
  segment,
}: MotionSegmentBuildContext): Promise<MotionSegmentBuildResult> {
  if (segment.graphic.type !== "KEY_POINTS") {
    throw new Error(
      `Motion template mismatch: expected KEY_POINTS, received ${segment.graphic.type}.`
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

  const points =
    graphic.points.slice(
      0,
      5
    );

  const pointCount =
    points.length;

  const introDuration =
    Math.min(
      0.32,
      Math.max(
        0.20,
        segmentDuration *
          0.09
      ),
      segmentDuration *
        0.18
    );

  const outroDuration =
    Math.min(
      0.22,
      Math.max(
        0.12,
        segmentDuration *
          0.06
      ),
      segmentDuration *
        0.14
    );

  const introEnd =
    segmentStart +
    introDuration;

  const outroStart =
    Math.max(
      introEnd,
      segmentEnd -
        outroDuration
    );

  const availableForPoints =
    Math.max(
      0.24,
      outroStart -
        introEnd
    );

  const nominalSlot =
    availableForPoints /
    Math.max(
      1,
      pointCount
    );

  const pointDuration =
    Math.min(
      0.28,
      Math.max(
        0.08,
        nominalSlot *
          0.58
      )
    );

  let phaseCursor =
    segmentStart;

  const createPointState = (
    revealedPoints: number,
    currentPointIndex:
      | number
      | null,
    currentPointProgress: number,
    exitProgress = 0
  ) => ({
    introProgress: 1,

    pointProgresses:
      points.map(
        (
          _,
          index
        ) => {
          if (
            index <
            revealedPoints
          ) {
            return 1;
          }

          if (
            currentPointIndex ===
            index
          ) {
            return currentPointProgress;
          }

          return 0;
        }
      ),

    exitProgress,
  });

  async function addKeyPointsAnimatedState(
    keyPrefix: string,
    phaseDuration: number,
    frameSteps: number,
    buildState: (
      progress: number
    ) => {
      introProgress: number;
      pointProgresses: number[];
      exitProgress: number;
    }
  ) {
    if (
      phaseDuration <=
        0.001 ||
      frameSteps <=
        0
    ) {
      return;
    }

    for (
      let frameIndex = 0;
      frameIndex <
      frameSteps;
      frameIndex += 1
    ) {
      const progress =
        (
          frameIndex +
          1
        ) /
        frameSteps;

      const key =
        `segment-${segmentIndex}-key-points-${keyPrefix}-${frameIndex}`;

      assets.push({
        key,

        data:
          await createKeyPointsPng(
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
          frameSteps
      );
    }

    phaseCursor +=
      phaseDuration;
  }

  async function addKeyPointsStaticState(
    keySuffix: string,
    frameDuration: number,
    state: {
      introProgress: number;
      pointProgresses: number[];
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
      `segment-${segmentIndex}-key-points-${keySuffix}`;

    assets.push({
      key,

      data:
        await createKeyPointsPng(
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
    1. Fondo + label.
  */
  await addKeyPointsAnimatedState(
    "intro",
    introDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      introProgress:
        progress,

      pointProgresses:
        points.map(
          () =>
            0
        ),

      exitProgress: 0,
    })
  );

  /*
    2. Reveal secuencial de cada punto.
  */
  for (
    let pointIndex = 0;
    pointIndex <
    pointCount;
    pointIndex += 1
  ) {
    const remainingPointCount =
      pointCount -
      pointIndex;

    const preferredRevealAt =
      segment.pointRevealAt?.[
        pointIndex
      ];

    const fallbackRevealAt =
      introEnd +
      (
        availableForPoints *
        pointIndex /
        Math.max(
          1,
          pointCount
        )
      );

    const earliestRevealAt =
      phaseCursor;

    const latestRevealAt =
      Math.max(
        earliestRevealAt,
        outroStart -
          remainingPointCount *
            pointDuration
      );

    const revealAt =
      clamp(
        preferredRevealAt !==
            null &&
          preferredRevealAt !==
            undefined &&
          Number.isFinite(
            preferredRevealAt
          )
          ? preferredRevealAt -
            0.04
          : fallbackRevealAt,
        earliestRevealAt,
        latestRevealAt
      );

    await addKeyPointsStaticState(
      `hold-before-point-${pointIndex}`,
      Math.max(
        0,
        revealAt -
          phaseCursor
      ),
      createPointState(
        pointIndex,
        null,
        0
      )
    );

    const realPointDuration =
      Math.max(
        0,
        Math.min(
          pointDuration,
          outroStart -
            phaseCursor
        )
      );

    await addKeyPointsAnimatedState(
      `point-${pointIndex}`,
      realPointDuration,
      segmentDuration >=
        1
        ? 6
        : 3,
      (progress) =>
        createPointState(
          pointIndex,
          pointIndex,
          progress
        )
    );
  }

  /*
    3. Lista completa.
  */
  await addKeyPointsStaticState(
    "complete-hold",
    Math.max(
      0,
      outroStart -
        phaseCursor
    ),
    createPointState(
      pointCount,
      null,
      0
    )
  );

  /*
    4. Salida.
  */
  const remainingOutroDuration =
    Math.max(
      0,
      segmentEnd -
        phaseCursor
    );

  await addKeyPointsAnimatedState(
    "outro",
    remainingOutroDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      ...createPointState(
        pointCount,
        null,
        0
      ),

      exitProgress:
        progress,
    })
  );

  return {
    assets,
    frames,
  };
}
