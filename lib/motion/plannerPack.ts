import { getMotionTemplateDefinition } from "./templateRegistry";
import type { MotionGraphicRequest } from "./types";

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const choice = (...values: string[]) => ({ type: "string", enum: values });
const object = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
const list = (items: unknown, minItems: number, maxItems: number) => ({ type: "array", items, minItems, maxItems });
const state = object({ label: text(36), state: choice("FRAGMENTED", "ORGANIZED", "IDLE", "ACTIVE") });

// Extend each planner's existing union; the original five schemas stay unchanged.
export const motionPackSchemas = [
  object({ type: choice("APP_FLOW"), screens: list(object({ name: text(36), action: text(30) }), 2, 4) }),
  object({ type: choice("UI_HIGHLIGHT"), surface: choice("FORM", "DASHBOARD", "LANDING"),
    elements: list(object({ label: text(30), role: choice("INPUT", "BUTTON", "CARD", "CHART") }), 2, 4),
    focus: list({ type: "integer", minimum: 0, maximum: 3 }, 1, 4) }),
  object({ type: choice("BEFORE_AFTER"), scene: choice("WORKSPACE", "WEBSITE", "DATA"), before: state, after: state }),
  object({ type: choice("METRIC_COUNTER"), label: text(36),
    from: { type: "number", minimum: -1e12, maximum: 1e12 },
    to: { type: "number", minimum: -1e12, maximum: 1e12 },
    unit: { type: ["string", "null"], maxLength: 16 } }),
  object({ type: choice("FUNNEL_FLOW"), stages: list(text(36), 3, 5) }),
  object({ type: choice("SYSTEM_DIAGRAM"),
    nodes: list(object({ id: { ...text(16), pattern: "^[a-zA-Z0-9_-]{1,16}$" }, label: text(30),
      kind: choice("USER", "APP", "API", "AI", "DATABASE") }), 2, 5),
    connections: list(object({ from: text(16), to: text(16) }), 1, 6) }),
  object({ type: choice("TIMELINE"), events: list(object({ when: text(20), label: text(36) }), 2, 5) }),
  object({ type: choice("STACK_BUILD"), layers: list(object({ label: text(30),
    role: choice("INTERFACE", "LOGIC", "DATA", "INFRASTRUCTURE") }), 2, 5) }),
];

// Relational constraints (focus indices, edges, distinct states/values) belong to
// the existing registry rather than duplicated renderer whitelists.
export function isRenderableMotionRequest(value: unknown): value is MotionGraphicRequest {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  try {
    const graphic = value as MotionGraphicRequest;
    return Boolean(getMotionTemplateDefinition(graphic.type)?.isValid({ start: 0, end: 1, graphic }));
  } catch { return false; }
}

export const motionPackPlannerRules = `
ADDITIONAL MOTION PACK — semantic selection rules (also available for fallback):
APP_FLOW: 2-4 explicit app interactions/screens in spoken order. screens: [{name, action}].
UI_HIGHLIGHT: focus on explicit UI controls in a FORM, DASHBOARD or LANDING.
  elements: 2-4 {label, role: INPUT|BUTTON|CARD|CHART}; focus: 1-4 zero-based indices
  referencing existing elements in spoken focus order. No imagined UI features.
BEFORE_AFTER: explicit transformation of the SAME scene (WORKSPACE|WEBSITE|DATA).
  before/after: {label, state: FRAGMENTED|ORGANIZED|IDLE|ACTIVE}; states must differ.
  Use COMPARISON for competing options, WEB_COMPARISON for website layout contrasts.
METRIC_COUNTER: an explicit numeric change with BOTH endpoints stated. {label, from, to, unit}.
  from and to must differ; never assume a zero baseline, calculate savings, or invent a target.
  Use STAT_CALLOUT for a single number. unit is a short spoken unit or null.
FUNNEL_FLOW: 3-5 explicit conversion stages, in order. {stages: string[]}.
  Do not invent conversions, percentages, drop-offs or imply measured conversion rates.
  Use PROCESS_FLOW for general workflows that are not a conversion journey.
SYSTEM_DIAGRAM: explicit components AND directed relationships.
  nodes: 2-5 {id, label, kind: USER|APP|API|AI|DATABASE};
  connections: 1-6 {from, to} referencing unique node ids. No self edges or duplicates.
  Do not infer system architecture from a mere list of technologies.
TIMELINE: 2-5 events with spoken temporal anchors. {events: [{when, label}]}.
  Dates/relative times must be in the transcript; no invented milestones.
STACK_BUILD: 2-5 explicit system layers/components. {layers: [{label,
  role: INTERFACE|LOGIC|DATA|INFRASTRUCTURE}]}. Preserve described order.
  Use KEY_POINTS for parallel ideas that are not actual system components.

These eight types are valid motionGraphic.type values in addition to the original five.
Choose motion only when it illustrates the spoken idea better than relevant B-roll or an
Impact Word. No quotas, minimum counts, forced variety, or obligation to use this pack.
All facts, interactions, numbers, stages, entities and relationships must be supported
by the segment transcript. Only shorten wording; never invent content to fill a schema.
When a segment lacks enough information to satisfy a type, choose another valid visual.
Audio explains, subtitles accompany, motion illustrates. Use short functional labels;
no editorial headlines repeating narration, paragraphs, CSS, HTML, coordinates, custom
colors or model-defined animation. CutPilot controls composition and movement.
For MOTION_GRAPHIC, clear broll and impactText/textOverlay as appropriate: visuals are
exclusive, never a B-roll request and a motion request on the same item.
`;
