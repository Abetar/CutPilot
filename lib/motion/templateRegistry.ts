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

import { buildAppFlowSegment } from "./timelineBuilders/appFlow";
import { buildUiHighlightSegment } from "./timelineBuilders/uiHighlight";
import { buildBeforeAfterSegment } from "./timelineBuilders/beforeAfter";
import { buildMetricCounterSegment } from "./timelineBuilders/metricCounter";
import { buildFunnelFlowSegment } from "./timelineBuilders/funnelFlow";
import { buildSystemDiagramSegment } from "./timelineBuilders/systemDiagram";
import { buildTimelineSegment } from "./timelineBuilders/timeline";
import { buildStackBuildSegment } from "./timelineBuilders/stackBuild";

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
  STACK_BUILD: {
    type: "STACK_BUILD",
    isValid: segment => segment.graphic.type === "STACK_BUILD" &&
      Array.isArray(segment.graphic.layers) && segment.graphic.layers.length >= 2 && segment.graphic.layers.length <= 5 &&
      segment.graphic.layers.every(layer => typeof layer.label === "string" && layer.label.trim().length > 0 && layer.label.length <= 30 &&
        ["INTERFACE", "LOGIC", "DATA", "INFRASTRUCTURE"].includes(layer.role)),
    build: buildStackBuildSegment,
  },
  TIMELINE: {
    type: "TIMELINE",
    isValid: segment => segment.graphic.type === "TIMELINE" &&
      Array.isArray(segment.graphic.events) && segment.graphic.events.length >= 2 && segment.graphic.events.length <= 5 &&
      segment.graphic.events.every(event => typeof event.when === "string" && event.when.trim().length > 0 && event.when.length <= 20 &&
        typeof event.label === "string" && event.label.trim().length > 0 && event.label.length <= 36),
    build: buildTimelineSegment,
  },
  SYSTEM_DIAGRAM: {
    type: "SYSTEM_DIAGRAM",
    isValid: segment => {
      const g = segment.graphic;
      if (g.type !== "SYSTEM_DIAGRAM" || !Array.isArray(g.nodes) || g.nodes.length < 2 || g.nodes.length > 5 ||
        !Array.isArray(g.connections) || g.connections.length < 1 || g.connections.length > 6) return false;
      const ids = new Set(g.nodes.map(node => node.id));
      return ids.size === g.nodes.length && g.nodes.every(node => typeof node.id === "string" && /^[a-zA-Z0-9_-]{1,16}$/.test(node.id) &&
        typeof node.label === "string" && node.label.trim().length > 0 && node.label.length <= 30 &&
        ["USER", "APP", "API", "AI", "DATABASE"].includes(node.kind)) &&
        g.connections.every(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to) &&
        new Set(g.connections.map(edge => `${edge.from}:${edge.to}`)).size === g.connections.length;
    },
    build: buildSystemDiagramSegment,
  },
  FUNNEL_FLOW: {
    type: "FUNNEL_FLOW",
    isValid: segment => segment.graphic.type === "FUNNEL_FLOW" &&
      Array.isArray(segment.graphic.stages) && segment.graphic.stages.length >= 3 && segment.graphic.stages.length <= 5 &&
      segment.graphic.stages.every(stage => typeof stage === "string" && stage.trim().length > 0 && stage.length <= 36),
    build: buildFunnelFlowSegment,
  },
  METRIC_COUNTER: {
    type: "METRIC_COUNTER",
    isValid: segment => segment.graphic.type === "METRIC_COUNTER" &&
      typeof segment.graphic.label === "string" && segment.graphic.label.trim().length > 0 && segment.graphic.label.length <= 36 &&
      Number.isFinite(segment.graphic.from) && Number.isFinite(segment.graphic.to) &&
      Math.abs(segment.graphic.from) <= 1e12 && Math.abs(segment.graphic.to) <= 1e12 && segment.graphic.from !== segment.graphic.to &&
      (segment.graphic.unit === null || (typeof segment.graphic.unit === "string" && segment.graphic.unit.length <= 16)),
    build: buildMetricCounterSegment,
  },
  BEFORE_AFTER: {
    type: "BEFORE_AFTER",
    isValid: segment => segment.graphic.type === "BEFORE_AFTER" &&
      ["WORKSPACE", "WEBSITE", "DATA"].includes(segment.graphic.scene) &&
      [segment.graphic.before, segment.graphic.after].every(state => typeof state?.label === "string" && state.label.trim().length > 0 && state.label.length <= 36 &&
        ["FRAGMENTED", "ORGANIZED", "IDLE", "ACTIVE"].includes(state.state)) &&
      segment.graphic.before.state !== segment.graphic.after.state,
    build: buildBeforeAfterSegment,
  },
  UI_HIGHLIGHT: {
    type: "UI_HIGHLIGHT",
    isValid: segment => segment.graphic.type === "UI_HIGHLIGHT" &&
      ["FORM", "DASHBOARD", "LANDING"].includes(segment.graphic.surface) &&
      Array.isArray(segment.graphic.elements) && segment.graphic.elements.length >= 2 && segment.graphic.elements.length <= 4 &&
      segment.graphic.elements.every(element => typeof element.label === "string" && element.label.trim().length > 0 && element.label.length <= 36 &&
        ["INPUT", "BUTTON", "CARD", "CHART"].includes(element.role)) &&
      Array.isArray(segment.graphic.focus) && segment.graphic.focus.length >= 1 && segment.graphic.focus.length <= 4 &&
      segment.graphic.focus.every(index => Number.isInteger(index) && index >= 0 && index < (segment.graphic.type === "UI_HIGHLIGHT" ? segment.graphic.elements.length : 0)),
    build: buildUiHighlightSegment,
  },
  APP_FLOW: {
    type: "APP_FLOW",
    isValid: segment => segment.graphic.type === "APP_FLOW" &&
      Array.isArray(segment.graphic.screens) && segment.graphic.screens.length >= 2 && segment.graphic.screens.length <= 4 &&
      segment.graphic.screens.every(screen => typeof screen.name === "string" && screen.name.trim().length > 0 && screen.name.length <= 36 &&
        typeof screen.action === "string" && screen.action.trim().length > 0 && screen.action.length <= 30),
    build: buildAppFlowSegment,
  },
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
