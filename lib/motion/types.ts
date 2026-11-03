export type MotionGraphicType =
  | "STAT_CALLOUT"
  | "COMPARISON"
  | "PROCESS_FLOW"
  | "KEY_POINTS"
  | "WEB_COMPARISON"
  | "APP_FLOW"
  | "UI_HIGHLIGHT"
  | "BEFORE_AFTER"
  | "METRIC_COUNTER"
  | "FUNNEL_FLOW"
  | "SYSTEM_DIAGRAM"
  | "TIMELINE"
  | "STACK_BUILD";

export type StatCalloutMotionGraphicRequest = {
  type: "STAT_CALLOUT";

  label: string | null;

  primary: string;

  secondary: string | null;
};

export type ComparisonEmphasis =
  | "LEFT"
  | "RIGHT"
  | "NEUTRAL";

export type ComparisonMotionGraphicRequest = {
  type: "COMPARISON";

  /*
    Contexto corto de la comparación.

    Ejemplos:
    "¿CUÁL CONVIENE?"
    "ANTES VS AHORA"
  */
  label: string | null;

  /*
    Lado A.
  */
  leftTitle: string;

  leftDetail: string | null;

  /*
    Lado B.
  */
  rightTitle: string;

  rightDetail: string | null;

  /*
    Solo se usa cuando la narración favorece
    explícitamente un lado.

    NEUTRAL evita inventar un ganador.
  */
  emphasis: ComparisonEmphasis;
};

export type ProcessFlowStep = {
  title: string;

  detail: string | null;
};

export type ProcessFlowMotionGraphicRequest = {
  type: "PROCESS_FLOW";

  /*
    Contexto corto del flujo.

    Ejemplos:
    "MI FLUJO"
    "CÓMO FUNCIONA"
  */
  label: string | null;

  /*
    V0 soporta exclusivamente flujos lineales
    de 3 a 5 pasos.
  */
  steps: ProcessFlowStep[];
};

export type KeyPoint = {
  title: string;

  detail: string | null;
};

export type KeyPointsMotionGraphicRequest = {
  type: "KEY_POINTS";

  /*
    Contexto corto de la lista.

    Ejemplos:
    "3 RAZONES"
    "LO QUE NECESITAS"
    "PUNTOS CLAVE"
  */
  label: string | null;

  /*
    V0 soporta listas de 2 a 5 puntos.

    A diferencia de PROCESS_FLOW, estos elementos
    NO implican secuencia ni dependencia.
  */
  points: KeyPoint[];
};


export type WebComparisonMotionGraphicRequest = {
  type: "WEB_COMPARISON";

  /*
    Contexto corto de la comparación.
    Ejemplo: "SIN DIRECCIÓN VS CON OBJETIVO"
  */
  label: string | null;

  /*
    Página problemática / sin dirección.
    El renderer controla el caos visual; el modelo sólo
    describe el contenido semántico que debe destacarse.
  */
  leftTitle: string;
  leftHeadline: string;
  leftIssues: string[];

  /*
    Página enfocada / dirigida a un objetivo.
  */
  rightTitle: string;
  rightHeadline: string;
  rightStrengths: string[];
  rightCta: string | null;
};

export type AppFlowMotionGraphicRequest = {
  type: "APP_FLOW";
  screens: Array<{ name: string; action: string }>;
};

export type UiHighlightMotionGraphicRequest = {
  type: "UI_HIGHLIGHT";
  surface: "FORM" | "DASHBOARD" | "LANDING";
  elements: Array<{ label: string; role: "INPUT" | "BUTTON" | "CARD" | "CHART" }>;
  focus: number[];
};

export type BeforeAfterState = "FRAGMENTED" | "ORGANIZED" | "IDLE" | "ACTIVE";
export type BeforeAfterMotionGraphicRequest = {
  type: "BEFORE_AFTER";
  scene: "WORKSPACE" | "WEBSITE" | "DATA";
  before: { label: string; state: BeforeAfterState };
  after: { label: string; state: BeforeAfterState };
};

export type MetricCounterMotionGraphicRequest = {
  type: "METRIC_COUNTER";
  label: string;
  from: number;
  to: number;
  unit: string | null;
};

export type FunnelFlowMotionGraphicRequest = {
  type: "FUNNEL_FLOW";
  stages: string[];
};

export type SystemDiagramMotionGraphicRequest = {
  type: "SYSTEM_DIAGRAM";
  nodes: Array<{ id: string; label: string; kind: "USER" | "APP" | "API" | "AI" | "DATABASE" }>;
  connections: Array<{ from: string; to: string }>;
};

export type TimelineMotionGraphicRequest = {
  type: "TIMELINE";
  events: Array<{ when: string; label: string }>;
};

export type StackBuildMotionGraphicRequest = {
  type: "STACK_BUILD";
  layers: Array<{ label: string; role: "INTERFACE" | "LOGIC" | "DATA" | "INFRASTRUCTURE" }>;
};

export type MotionGraphicRequest =
  | StatCalloutMotionGraphicRequest
  | ComparisonMotionGraphicRequest
  | ProcessFlowMotionGraphicRequest
  | KeyPointsMotionGraphicRequest
  | WebComparisonMotionGraphicRequest
  | AppFlowMotionGraphicRequest
  | UiHighlightMotionGraphicRequest
  | BeforeAfterMotionGraphicRequest
  | MetricCounterMotionGraphicRequest
  | FunnelFlowMotionGraphicRequest
  | SystemDiagramMotionGraphicRequest
  | TimelineMotionGraphicRequest
  | StackBuildMotionGraphicRequest;

export type RenderMotionGraphicSegment = {
  start: number;

  end: number;

  graphic: MotionGraphicRequest;

  /*
    Timestamp absoluto opcional para el reveal
    de la segunda parte del visual.

    STAT_CALLOUT:
    secondary

    COMPARISON:
    rightTitle

    Si no se encuentra en word timestamps,
    Motion Engine usa timing editorial.
  */
  secondaryRevealAt?:
    | number
    | null;

  /*
    PROCESS_FLOW:
    timestamp absoluto opcional para cada paso.

    El índice corresponde a graphic.steps[index].
  */
  stepRevealAt?:
    | Array<
        number |
        null
      >
    | null;

  /*
    KEY_POINTS:
    timestamp absoluto opcional para cada punto.

    El índice corresponde a graphic.points[index].
  */
  pointRevealAt?:
    | Array<
        number |
        null
      >
    | null;
};

export type MotionTimelineAsset = {
  key: string;

  data: Uint8Array;
};

export type MotionTimelineFrame = {
  assetKey: string;

  duration: number;
};

export type MotionTimeline = {
  assets: MotionTimelineAsset[];

  frames: MotionTimelineFrame[];
};
