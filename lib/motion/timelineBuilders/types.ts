import type {
  MotionTimelineAsset,
  MotionTimelineFrame,
  RenderMotionGraphicSegment,
} from "@/lib/motion/types";

export type MotionSegmentBuildContext = {
  width: number;
  height: number;
  segmentIndex: number;
  segmentStart: number;
  segmentEnd: number;
  segment: RenderMotionGraphicSegment;
};

export type MotionSegmentBuildResult = {
  assets: MotionTimelineAsset[];
  frames: MotionTimelineFrame[];
};

export function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  if (maximum < minimum) {
    return minimum;
  }

  return Math.max(
    minimum,
    Math.min(maximum, value)
  );
}
