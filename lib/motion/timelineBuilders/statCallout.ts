import {
  createStatCalloutPng,
} from "@/lib/motion/templates/statCallout";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

import {
  clamp,
} from "@/lib/motion/timelineBuilders/types";

export async function buildStatCalloutSegment({
  width,
  height,
  segmentIndex,
  segmentStart,
  segmentEnd,
  segment,
}: MotionSegmentBuildContext): Promise<MotionSegmentBuildResult> {
  if (segment.graphic.type !== "STAT_CALLOUT") {
    throw new Error(
      `Motion template mismatch: expected STAT_CALLOUT, received ${segment.graphic.type}.`
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

  const hasSecondary =
    Boolean(
      graphic.secondary?.trim()
    );

  const introDuration =
    Math.min(
      0.46,
      Math.max(
        0.24,
        segmentDuration *
          0.15
      ),
      segmentDuration *
        0.32
    );

  const outroDuration =
    Math.min(
      0.22,
      Math.max(
        0.12,
        segmentDuration *
          0.08
      ),
      segmentDuration *
        0.20
    );

  const connectorDuration =
    hasSecondary
      ? Math.min(
          0.18,
          Math.max(
            0.10,
            segmentDuration *
              0.055
          ),
          segmentDuration *
            0.14
        )
      : 0;

  const secondaryDuration =
    hasSecondary
      ? Math.min(
          0.32,
          Math.max(
            0.20,
            segmentDuration *
              0.10
          ),
          segmentDuration *
            0.22
        )
      : 0;

  const introEnd =
    segmentStart +
    introDuration;

  const outroStart =
    Math.max(
      introEnd,
      segmentEnd -
        outroDuration
    );

  let connectorStart =
    introEnd;

  let secondaryStart =
    introEnd;

  if (hasSecondary) {
    const preferredSecondaryStart =
      segment.secondaryRevealAt !==
        null &&
      segment.secondaryRevealAt !==
        undefined
        ? segment.secondaryRevealAt -
          0.05
        : segmentStart +
          segmentDuration *
            0.52;

    const earliestSecondaryStart =
      introEnd +
      connectorDuration;

    const latestSecondaryStart =
      Math.max(
        introEnd,
        outroStart -
          secondaryDuration
      );

    secondaryStart =
      clamp(
        preferredSecondaryStart,
        earliestSecondaryStart,
        latestSecondaryStart
      );

    connectorStart =
      Math.max(
        introEnd,
        secondaryStart -
          connectorDuration
      );
  }

  let phaseCursor =
    segmentStart;

  async function addStatAnimatedState(
    keyPrefix: string,
    phaseDuration: number,
    steps: number,
    buildState: (
      progress: number
    ) => {
      introProgress: number;
      connectorProgress: number;
      secondaryProgress: number;
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
        `segment-${segmentIndex}-stat-${keyPrefix}-${step}`;

      assets.push({
        key,

        data:
          await createStatCalloutPng(
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

  async function addStatStaticState(
    keySuffix: string,
    frameDuration: number,
    state: {
      introProgress: number;
      connectorProgress: number;
      secondaryProgress: number;
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
      `segment-${segmentIndex}-stat-${keySuffix}`;

    assets.push({
      key,

      data:
        await createStatCalloutPng(
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

  await addStatAnimatedState(
    "intro",
    introDuration,
    segmentDuration >=
      1
      ? 7
      : 4,
    (progress) => ({
      introProgress:
        progress,

      connectorProgress:
        0,

      secondaryProgress:
        0,

      exitProgress:
        0,
    })
  );

  if (hasSecondary) {
    await addStatStaticState(
      "primary-hold",
      Math.max(
        0,
        connectorStart -
          phaseCursor
      ),
      {
        introProgress: 1,
        connectorProgress: 0,
        secondaryProgress: 0,
        exitProgress: 0,
      }
    );

    const realConnectorDuration =
      Math.max(
        0,
        Math.min(
          connectorDuration,
          secondaryStart -
            phaseCursor
        )
      );

    await addStatAnimatedState(
      "connector",
      realConnectorDuration,
      segmentDuration >=
        1
        ? 5
        : 3,
      (progress) => ({
        introProgress: 1,

        connectorProgress:
          progress,

        secondaryProgress:
          0,

        exitProgress:
          0,
      })
    );

    await addStatStaticState(
      "connector-hold",
      Math.max(
        0,
        secondaryStart -
          phaseCursor
      ),
      {
        introProgress: 1,
        connectorProgress: 1,
        secondaryProgress: 0,
        exitProgress: 0,
      }
    );

    const realSecondaryDuration =
      Math.max(
        0,
        Math.min(
          secondaryDuration,
          outroStart -
            phaseCursor
        )
      );

    await addStatAnimatedState(
      "secondary",
      realSecondaryDuration,
      segmentDuration >=
        1
        ? 7
        : 4,
      (progress) => ({
        introProgress: 1,
        connectorProgress: 1,

        secondaryProgress:
          progress,

        exitProgress:
          0,
      })
    );

    await addStatStaticState(
      "complete-hold",
      Math.max(
        0,
        outroStart -
          phaseCursor
      ),
      {
        introProgress: 1,
        connectorProgress: 1,
        secondaryProgress: 1,
        exitProgress: 0,
      }
    );
  } else {
    await addStatStaticState(
      "single-hold",
      Math.max(
        0,
        outroStart -
          phaseCursor
      ),
      {
        introProgress: 1,
        connectorProgress: 0,
        secondaryProgress: 0,
        exitProgress: 0,
      }
    );
  }

  const remainingOutroDuration =
    Math.max(
      0,
      segmentEnd -
        phaseCursor
    );

  await addStatAnimatedState(
    "outro",
    remainingOutroDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      introProgress: 1,

      connectorProgress:
        hasSecondary
          ? 1
          : 0,

      secondaryProgress:
        hasSecondary
          ? 1
          : 0,

      exitProgress:
        progress,
    })
  );

  return {
    assets,
    frames,
  };
}
