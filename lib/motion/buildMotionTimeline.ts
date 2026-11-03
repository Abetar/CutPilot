import {
  createTransparentMotionPng,
} from "@/lib/motion/templates/statCallout";

import {
  getMotionTemplateDefinition,
} from "@/lib/motion/templateRegistry";

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

export async function buildMotionTimeline({
  width,
  height,
  duration,
  segments,
}: BuildMotionTimelineOptions): Promise<MotionTimeline> {
  if (typeof document === "undefined") {
    throw new Error(
      "Motion Graphics solo puede generarse en el navegador."
    );
  }

  const assets: MotionTimelineAsset[] = [];
  const frames: MotionTimelineFrame[] = [];

  const blankKey = "blank";

  assets.push({
    key: blankKey,
    data: await createTransparentMotionPng(
      width,
      height
    ),
  });

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

  const sortedSegments =
    [...segments]
      .filter((segment) => {
        if (
          !Number.isFinite(segment.start) ||
          !Number.isFinite(segment.end) ||
          segment.start < 0 ||
          segment.end <= segment.start ||
          segment.start >= duration
        ) {
          return false;
        }

        const definition =
          getMotionTemplateDefinition(
            segment.graphic.type
          );

        return definition.isValid(
          segment
        );
      })
      .map((segment) => ({
        ...segment,
        end: Math.min(
          segment.end,
          duration
        ),
        secondaryRevealAt:
          Number.isFinite(
            segment.secondaryRevealAt
          )
            ? segment.secondaryRevealAt
            : null,
      }))
      .sort(
        (a, b) => a.start - b.start
      );

  let cursor = 0;

  for (
    let segmentIndex = 0;
    segmentIndex < sortedSegments.length;
    segmentIndex += 1
  ) {
    const segment =
      sortedSegments[segmentIndex];

    // Motion Graphics no se solapan: el primero gana.
    const segmentStart = Math.max(
      cursor,
      segment.start
    );

    const segmentEnd = Math.min(
      duration,
      segment.end
    );

    if (segmentEnd <= segmentStart) {
      continue;
    }

    if (segmentStart > cursor + 0.001) {
      addFrame(
        blankKey,
        segmentStart - cursor
      );
    }

    const definition =
      getMotionTemplateDefinition(
        segment.graphic.type
      );

    const built = await definition.build({
      width,
      height,
      segmentIndex,
      segmentStart,
      segmentEnd,
      segment,
    });

    assets.push(...built.assets);
    frames.push(...built.frames);

    cursor = segmentEnd;
  }

  if (cursor < duration - 0.001) {
    addFrame(
      blankKey,
      duration - cursor
    );
  }

  return {
    assets,
    frames,
  };
}
