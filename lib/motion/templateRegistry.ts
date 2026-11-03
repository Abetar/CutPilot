import type {
  MotionGraphicType,
  RenderMotionGraphicSegment,
} from "@/lib/motion/types";

import type {
  MotionSegmentBuildContext,
  MotionSegmentBuildResult,
} from "@/lib/motion/timelineBuilders/types";

import {
  buildStatCalloutSegment,
} from "@/lib/motion/timelineBuilders/statCallout";
import {
  buildComparisonSegment,
} from "@/lib/motion/timelineBuilders/comparison";
import {
  buildProcessFlowSegment,
} from "@/lib/motion/timelineBuilders/processFlow";
import {
  buildKeyPointsSegment,
} from "@/lib/motion/timelineBuilders/keyPoints";
import {
  buildWebComparisonSegment,
} from "@/lib/motion/timelineBuilders/webComparison";

export type MotionTemplateDefinition = {
  type: MotionGraphicType;
  isValid: (segment: RenderMotionGraphicSegment) => boolean;
  build: (
    context: MotionSegmentBuildContext
  ) => Promise<MotionSegmentBuildResult>;
};

export const motionTemplateRegistry: Record<
  MotionGraphicType,
  MotionTemplateDefinition
> = {
  STAT_CALLOUT: {
    type: "STAT_CALLOUT",
    isValid: (segment) =>
      segment.graphic.type === "STAT_CALLOUT" &&
      segment.graphic.primary.trim().length > 0,
    build: buildStatCalloutSegment,
  },

  COMPARISON: {
    type: "COMPARISON",
    isValid: (segment) =>
      segment.graphic.type === "COMPARISON" &&
      segment.graphic.leftTitle.trim().length > 0 &&
      segment.graphic.rightTitle.trim().length > 0,
    build: buildComparisonSegment,
  },

  PROCESS_FLOW: {
    type: "PROCESS_FLOW",
    isValid: (segment) =>
      segment.graphic.type === "PROCESS_FLOW" &&
      segment.graphic.steps.length >= 3 &&
      segment.graphic.steps.length <= 5 &&
      segment.graphic.steps.every(
        (step) => step.title.trim().length > 0
      ),
    build: buildProcessFlowSegment,
  },

  KEY_POINTS: {
    type: "KEY_POINTS",
    isValid: (segment) =>
      segment.graphic.type === "KEY_POINTS" &&
      segment.graphic.points.length >= 2 &&
      segment.graphic.points.length <= 5 &&
      segment.graphic.points.every(
        (point) => point.title.trim().length > 0
      ),
    build: buildKeyPointsSegment,
  },

  WEB_COMPARISON: {
    type: "WEB_COMPARISON",
    isValid: (segment) =>
      segment.graphic.type === "WEB_COMPARISON" &&
      segment.graphic.leftTitle.trim().length > 0 &&
      segment.graphic.leftHeadline.trim().length > 0 &&
      segment.graphic.leftIssues.length >= 1 &&
      segment.graphic.leftIssues.length <= 3 &&
      segment.graphic.leftIssues.every(
        (issue) => issue.trim().length > 0
      ) &&
      segment.graphic.rightTitle.trim().length > 0 &&
      segment.graphic.rightHeadline.trim().length > 0 &&
      segment.graphic.rightStrengths.length >= 1 &&
      segment.graphic.rightStrengths.length <= 3 &&
      segment.graphic.rightStrengths.every(
        (strength) => strength.trim().length > 0
      ),
    build: buildWebComparisonSegment,
  },
};

export function getMotionTemplateDefinition(
  type: MotionGraphicType
) {
  return motionTemplateRegistry[type];
}
