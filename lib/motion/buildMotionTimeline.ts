import {
  createStatCalloutPng,
  createTransparentMotionPng,
} from "@/lib/motion/templates/statCallout";

import {
  createComparisonPng,
} from "@/lib/motion/templates/comparison";

import {
  createProcessFlowPng,
} from "@/lib/motion/templates/processFlow";

import {
  createKeyPointsPng,
} from "@/lib/motion/templates/keyPoints";

import type {
  MotionTimeline,
  MotionTimelineAsset,
  MotionTimelineFrame,
  RenderMotionGraphicSegment,
} from "@/lib/motion/types";

type BuildMotionTimelineOptions = {
  width: number;

  height: number;

  duration: number;

  segments: RenderMotionGraphicSegment[];
};

function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  if (
    maximum <
    minimum
  ) {
    return minimum;
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      value
    )
  );
}

export async function buildMotionTimeline({
  width,
  height,
  duration,
  segments,
}: BuildMotionTimelineOptions): Promise<MotionTimeline> {
  if (
    typeof document ===
    "undefined"
  ) {
    throw new Error(
      "Motion Graphics solo puede generarse en el navegador."
    );
  }

  const assets: MotionTimelineAsset[] =
    [];

  const frames: MotionTimelineFrame[] =
    [];

  const blankKey =
    "blank";

  assets.push({
    key: blankKey,
    data:
      await createTransparentMotionPng(
        width,
        height
      ),
  });

  const addFrame = (
    assetKey: string,
    frameDuration: number
  ) => {
    if (
      !Number.isFinite(
        frameDuration
      ) ||
      frameDuration <=
        0.001
    ) {
      return;
    }

    frames.push({
      assetKey,
      duration:
        frameDuration,
    });
  };

  const sortedSegments =
    [...segments]
      .filter(
        (segment) =>
          Number.isFinite(
            segment.start
          ) &&
          Number.isFinite(
            segment.end
          ) &&
          segment.start >=
            0 &&
          segment.end >
            segment.start &&
          segment.start <
            duration &&
          (
            segment.graphic.type ===
              "STAT_CALLOUT"
              ? segment.graphic.primary
                  .trim().length >
                0
              : segment.graphic.type ===
                  "COMPARISON"
                ? segment.graphic.leftTitle
                    .trim().length >
                    0 &&
                  segment.graphic.rightTitle
                    .trim().length >
                    0
                : segment.graphic.type ===
                    "PROCESS_FLOW"
                  ? segment.graphic.steps.length >=
                      3 &&
                    segment.graphic.steps.length <=
                      5 &&
                    segment.graphic.steps.every(
                      (step) =>
                        step.title
                          .trim().length >
                        0
                    )
                  : segment.graphic.type ===
                      "KEY_POINTS"
                    ? segment.graphic.points.length >=
                        2 &&
                      segment.graphic.points.length <=
                        5 &&
                      segment.graphic.points.every(
                        (point) =>
                          point.title
                            .trim().length >
                          0
                      )
                    : false
          )
      )
      .map(
        (segment) => ({
          ...segment,

          end:
            Math.min(
              segment.end,
              duration
            ),

          secondaryRevealAt:
            Number.isFinite(
              segment.secondaryRevealAt
            )
              ? segment.secondaryRevealAt
              : null,
        })
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  let cursor =
    0;

  for (
    let segmentIndex = 0;
    segmentIndex <
    sortedSegments.length;
    segmentIndex += 1
  ) {
    const segment =
      sortedSegments[
        segmentIndex
      ];

    /*
      No permitimos Motion Graphics superpuestos.
    */
    const segmentStart =
      Math.max(
        cursor,
        segment.start
      );

    const segmentEnd =
      Math.min(
        duration,
        segment.end
      );

    if (
      segmentEnd <=
      segmentStart
    ) {
      continue;
    }

    if (
      segmentStart >
      cursor +
        0.001
    ) {
      addFrame(
        blankKey,
        segmentStart -
          cursor
      );
    }

    const segmentDuration =
      segmentEnd -
      segmentStart;

    /*
      ==================================================
      STAT_CALLOUT
      ==================================================
    */
    if (
      segment.graphic.type ===
      "STAT_CALLOUT"
    ) {
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

      cursor =
        segmentEnd;

      continue;
    }

    /*
      ==================================================
      COMPARISON
      ==================================================
    */
    if (
      segment.graphic.type ===
      "COMPARISON"
    ) {
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

      cursor =
        segmentEnd;

      continue;
    }

    /*
      ==================================================
      KEY_POINTS
      ==================================================

      Lista de 2 a 5 ideas equivalentes.

      A diferencia de PROCESS_FLOW:
      - no hay conectores
      - ningún punto implica que "lleve" al siguiente
      - cada punto simplemente se revela siguiendo
        la narración.
    */
    if (
      segment.graphic.type ===
      "KEY_POINTS"
    ) {
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

      cursor =
        segmentEnd;

      continue;
    }

    /*
      ==================================================
      PROCESS_FLOW
      ==================================================
    */
    if (
      segment.graphic.type ===
      "PROCESS_FLOW"
    ) {
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

      cursor =
        segmentEnd;
    }
  }

  if (
    cursor <
    duration -
      0.001
  ) {
    addFrame(
      blankKey,
      duration -
        cursor
    );
  }

  return {
    assets,
    frames,
  };
}
