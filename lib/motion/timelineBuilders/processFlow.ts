import {
  createProcessFlowPng,
} from "@/lib/motion/templates/processFlow";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

import {
  clamp,
} from "@/lib/motion/timelineBuilders/types";

export async function buildProcessFlowSegment({
  width,
  height,
  segmentIndex,
  segmentStart,
  segmentEnd,
  segment,
}: MotionSegmentBuildContext): Promise<MotionSegmentBuildResult> {
  if (segment.graphic.type !== "PROCESS_FLOW") {
    throw new Error(
      `Motion template mismatch: expected PROCESS_FLOW, received ${segment.graphic.type}.`
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

  const steps =
    graphic.steps.slice(
      0,
      5
    );

  const stepCount =
    steps.length;

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

  const outroStart =
    Math.max(
      segmentStart +
        introDuration,
      segmentEnd -
        outroDuration
    );

  const availableForFlow =
    Math.max(
      0.30,
      outroStart -
        (
          segmentStart +
          introDuration
        )
    );

  const unit =
    availableForFlow /
    Math.max(
      1,
      stepCount +
        (
          stepCount -
          1
        ) *
          0.40
    );

  const stepDuration =
    Math.min(
      0.30,
      Math.max(
        0.16,
        unit
      )
    );

  const connectorDuration =
    stepCount >
    1
      ? Math.min(
          0.13,
          Math.max(
            0.07,
            stepDuration *
              0.40
          )
        )
      : 0;

  let phaseCursor =
    segmentStart;

  const createFlowState = (
    revealedSteps: number,
    currentStepIndex:
      | number
      | null,
    currentStepProgress: number,
    revealedConnectors: number,
    currentConnectorIndex:
      | number
      | null,
    currentConnectorProgress: number,
    exitProgress = 0
  ) => ({
    introProgress: 1,

    stepProgresses:
      steps.map(
        (
          _,
          index
        ) => {
          if (
            index <
            revealedSteps
          ) {
            return 1;
          }

          if (
            currentStepIndex ===
            index
          ) {
            return currentStepProgress;
          }

          return 0;
        }
      ),

    connectorProgresses:
      steps
        .slice(
          0,
          -1
        )
        .map(
          (
            _,
            index
          ) => {
            if (
              index <
              revealedConnectors
            ) {
              return 1;
            }

            if (
              currentConnectorIndex ===
              index
            ) {
              return currentConnectorProgress;
            }

            return 0;
          }
        ),

    exitProgress,
  });

  async function addFlowAnimatedState(
    keyPrefix: string,
    phaseDuration: number,
    frameSteps: number,
    buildState: (
      progress: number
    ) => {
      introProgress: number;
      stepProgresses: number[];
      connectorProgresses: number[];
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
        `segment-${segmentIndex}-process-${keyPrefix}-${frameIndex}`;

      assets.push({
        key,

        data:
          await createProcessFlowPng(
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

  async function addFlowStaticState(
    keySuffix: string,
    frameDuration: number,
    state: {
      introProgress: number;
      stepProgresses: number[];
      connectorProgresses: number[];
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
      `segment-${segmentIndex}-process-${keySuffix}`;

    assets.push({
      key,

      data:
        await createProcessFlowPng(
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
  await addFlowAnimatedState(
    "intro",
    introDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      introProgress:
        progress,

      stepProgresses:
        steps.map(
          () =>
            0
        ),

      connectorProgresses:
        steps
          .slice(
            0,
            -1
          )
          .map(
            () =>
              0
          ),

      exitProgress: 0,
    })
  );

  /*
    2. Cada paso entra en secuencia.

    Cuando tenemos word timestamps, intentamos
    acercar el reveal al momento hablado.
  */
  for (
    let stepIndex = 0;
    stepIndex <
    stepCount;
    stepIndex += 1
  ) {
    const remainingStepCount =
      stepCount -
      stepIndex;

    const remainingConnectorCount =
      Math.max(
        0,
        stepCount -
          1 -
          stepIndex
      );

    const remainingMinimumDuration =
      remainingStepCount *
        stepDuration +
      remainingConnectorCount *
        connectorDuration;

    const preferredRevealAt =
      segment.stepRevealAt?.[
        stepIndex
      ];

    const fallbackRevealAt =
      segmentStart +
      introDuration +
      (
        availableForFlow *
        stepIndex /
        Math.max(
          1,
          stepCount
        )
      );

    const earliestRevealAt =
      phaseCursor +
      (
        stepIndex >
          0
          ? connectorDuration
          : 0
      );

    const latestRevealAt =
      Math.max(
        earliestRevealAt,
        outroStart -
          remainingMinimumDuration +
          stepDuration
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

    if (
      stepIndex >
      0
    ) {
      const connectorIndex =
        stepIndex -
        1;

      const connectorStart =
        Math.max(
          phaseCursor,
          revealAt -
            connectorDuration
        );

      await addFlowStaticState(
        `hold-before-connector-${connectorIndex}`,
        Math.max(
          0,
          connectorStart -
            phaseCursor
        ),
        createFlowState(
          stepIndex,
          null,
          0,
          connectorIndex,
          null,
          0
        )
      );

      const realConnectorDuration =
        Math.max(
          0,
          Math.min(
            connectorDuration,
            revealAt -
              phaseCursor
          )
        );

      await addFlowAnimatedState(
        `connector-${connectorIndex}`,
        realConnectorDuration,
        segmentDuration >=
          1
          ? 4
          : 2,
        (progress) =>
          createFlowState(
            stepIndex,
            null,
            0,
            connectorIndex,
            connectorIndex,
            progress
          )
      );

      await addFlowStaticState(
        `hold-after-connector-${connectorIndex}`,
        Math.max(
          0,
          revealAt -
            phaseCursor
        ),
        createFlowState(
          stepIndex,
          null,
          0,
          connectorIndex +
            1,
          null,
          0
        )
      );
    } else {
      await addFlowStaticState(
        "hold-before-first-step",
        Math.max(
          0,
          revealAt -
            phaseCursor
        ),
        createFlowState(
          0,
          null,
          0,
          0,
          null,
          0
        )
      );
    }

    const realStepDuration =
      Math.max(
        0,
        Math.min(
          stepDuration,
          outroStart -
            phaseCursor
        )
      );

    await addFlowAnimatedState(
      `step-${stepIndex}`,
      realStepDuration,
      segmentDuration >=
        1
        ? 6
        : 3,
      (progress) =>
        createFlowState(
          stepIndex,
          stepIndex,
          progress,
          stepIndex,
          null,
          0
        )
    );
  }

  /*
    3. Flujo completo.
  */
  await addFlowStaticState(
    "complete-hold",
    Math.max(
      0,
      outroStart -
        phaseCursor
    ),
    createFlowState(
      stepCount,
      null,
      0,
      Math.max(
        0,
        stepCount -
          1
      ),
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

  await addFlowAnimatedState(
    "outro",
    remainingOutroDuration,
    segmentDuration >=
      1
      ? 5
      : 3,
    (progress) => ({
      ...createFlowState(
        stepCount,
        null,
        0,
        Math.max(
          0,
          stepCount -
            1
        ),
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
