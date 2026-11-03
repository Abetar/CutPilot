import {
  motionPackSchemas,
  motionPackPlannerRules,
  isRenderableMotionRequest,
} from "@/lib/motion/plannerPack";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

import type {
  MotionGraphicRequest,
} from "@/lib/motion/types";

export const runtime = "nodejs";

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  segments: TranscriptSegment[];
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;

  error?: {
    message?: string;
  };
};

type VisualPlanItem = {
  id: string;
  start: number;
  end: number;
  transcript: string;

  action:
    | "BROLL"
    | "IMPACT_WORD"
    | "MOTION_GRAPHIC";

  broll:
    | {
        subject: string | null;
        intent: string | null;
        concepts: string[];
      }
    | null;

  motionGraphic:
    | MotionGraphicRequest
    | null;

  impactText: string | null;

  reason: string;
};

type VisualPlan = {
  summary: string;
  duration: number;
  items: VisualPlanItem[];
};

const visualPlanSchema = {
  type: "object",

  additionalProperties: false,

  required: [
    "summary",
    "duration",
    "items",
  ],

  properties: {
    summary: {
      type: "string",
    },

    duration: {
      type: "number",
    },

    items: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

        required: [
          "id",
          "start",
          "end",
          "transcript",
          "action",
          "broll",
          "motionGraphic",
          "impactText",
          "reason",
        ],

        properties: {
          id: {
            type: "string",
          },

          start: {
            type: "number",
          },

          end: {
            type: "number",
          },

          transcript: {
            type: "string",
          },

          action: {
            type: "string",

            enum: [
              "BROLL",
              "IMPACT_WORD",
              "MOTION_GRAPHIC",
            ],
          },

          broll: {
            anyOf: [
              {
                type: "null",
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "subject",
                  "intent",
                  "concepts",
                ],

                properties: {
                  subject: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  intent: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  concepts: {
                    type: "array",

                    items: {
                      type: "string",
                    },
                  },
                },
              },
            ],
          },

          motionGraphic: {
            anyOf: [
              ...motionPackSchemas,
              {
                type: "null",
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "type",
                  "label",
                  "primary",
                  "secondary",
                ],

                properties: {
                  type: {
                    type: "string",

                    enum: [
                      "STAT_CALLOUT",
                    ],
                  },

                  label: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  primary: {
                    type: "string",
                  },

                  secondary: {
                    type: [
                      "string",
                      "null",
                    ],
                  },
                },
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "type",
                  "label",
                  "leftTitle",
                  "leftDetail",
                  "rightTitle",
                  "rightDetail",
                  "emphasis",
                ],

                properties: {
                  type: {
                    type: "string",

                    enum: [
                      "COMPARISON",
                    ],
                  },

                  label: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  leftTitle: {
                    type: "string",
                  },

                  leftDetail: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  rightTitle: {
                    type: "string",
                  },

                  rightDetail: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  emphasis: {
                    type: "string",

                    enum: [
                      "LEFT",
                      "RIGHT",
                      "NEUTRAL",
                    ],
                  },
                },
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "type",
                  "label",
                  "steps",
                ],

                properties: {
                  type: {
                    type: "string",

                    enum: [
                      "PROCESS_FLOW",
                    ],
                  },

                  label: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  steps: {
                    type: "array",

                    minItems: 3,

                    maxItems: 5,

                    items: {
                      type: "object",

                      additionalProperties: false,

                      required: [
                        "title",
                        "detail",
                      ],

                      properties: {
                        title: {
                          type: "string",
                        },

                        detail: {
                          type: [
                            "string",
                            "null",
                          ],
                        },
                      },
                    },
                  },
                },
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "type",
                  "label",
                  "points",
                ],

                properties: {
                  type: {
                    type: "string",

                    enum: [
                      "KEY_POINTS",
                    ],
                  },

                  label: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  points: {
                    type: "array",

                    minItems: 2,

                    maxItems: 5,

                    items: {
                      type: "object",

                      additionalProperties: false,

                      required: [
                        "title",
                        "detail",
                      ],

                      properties: {
                        title: {
                          type: "string",
                        },

                        detail: {
                          type: [
                            "string",
                            "null",
                          ],
                        },
                      },
                    },
                  },
                },
              },

              {
                type: "object",

                additionalProperties: false,

                required: [
                  "type",
                  "label",
                  "leftTitle",
                  "leftHeadline",
                  "leftIssues",
                  "rightTitle",
                  "rightHeadline",
                  "rightStrengths",
                  "rightCta",
                ],

                properties: {
                  type: {
                    type: "string",

                    enum: [
                      "WEB_COMPARISON",
                    ],
                  },

                  label: {
                    type: [
                      "string",
                      "null",
                    ],
                  },

                  leftTitle: {
                    type: "string",
                  },

                  leftHeadline: {
                    type: "string",
                  },

                  leftIssues: {
                    type: "array",

                    minItems: 2,

                    maxItems: 3,

                    items: {
                      type: "string",
                    },
                  },

                  rightTitle: {
                    type: "string",
                  },

                  rightHeadline: {
                    type: "string",
                  },

                  rightStrengths: {
                    type: "array",

                    minItems: 2,

                    maxItems: 3,

                    items: {
                      type: "string",
                    },
                  },

                  rightCta: {
                    type: [
                      "string",
                      "null",
                    ],
                  },
                },
              },
            ],
          },

          impactText: {
            type: [
              "string",
              "null",
            ],
          },

          reason: {
            type: "string",
          },
        },
      },
    },
  },
};

function getTimelineDuration(
  transcription: Transcription
) {
  if (
    typeof transcription.duration === "number" &&
    Number.isFinite(transcription.duration) &&
    transcription.duration > 0
  ) {
    return transcription.duration;
  }

  const lastSegmentEnd =
    transcription.segments.reduce(
      (max, segment) =>
        Number.isFinite(segment.end)
          ? Math.max(max, segment.end)
          : max,
      0
    );

  return lastSegmentEnd;
}

function normalizeAndValidatePlan(
  plan: VisualPlan,
  timelineDuration: number
):
  | {
      valid: true;
      plan: VisualPlan;
    }
  | {
      valid: false;
      error: string;
    } {
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    return {
      valid: false,
      error:
        "El Visual Plan no contiene segmentos.",
    };
  }

  const items = plan.items.map((item) => ({
    ...item,
    start: Number(item.start),
    end: Number(item.end),
  }));

  for (const item of items) {
    if (
      !Number.isFinite(item.start) ||
      !Number.isFinite(item.end) ||
      item.end <= item.start
    ) {
      return {
        valid: false,
        error:
          "El Visual Plan contiene timestamps inválidos.",
      };
    }

    if (
      item.start < -0.35 ||
      item.end > timelineDuration + 0.35
    ) {
      return {
        valid: false,
        error:
          "El Visual Plan contiene segmentos fuera de la duración del audio.",
      };
    }

    if (
      item.action === "IMPACT_WORD"
    ) {
      if (
        !item.impactText ||
        !item.impactText.trim()
      ) {
        return {
          valid: false,
          error:
            "Un segmento IMPACT_WORD no contiene impactText.",
        };
      }

      if (!item.broll) {
        return {
          valid: false,
          error:
            "Un segmento IMPACT_WORD necesita B-roll debajo.",
        };
      }

      item.motionGraphic =
        null;
    }

    if (
      item.action === "BROLL"
    ) {
      if (!item.broll) {
        return {
          valid: false,
          error:
            "Un segmento BROLL no contiene una solicitud B-roll.",
        };
      }

      item.impactText =
        null;

      item.motionGraphic =
        null;
    }

    if (
      item.action ===
      "MOTION_GRAPHIC"
    ) {
      if (
        !isRenderableMotionRequest(item.motionGraphic)
      ) {
        return {
          valid: false,
          error:
            "Un segmento MOTION_GRAPHIC contiene un payload ausente o inválido.",
        };
      }

      item.broll =
        null;

      item.impactText =
        null;
    }
  }

  const boundaryTolerance = 0.35;

  if (
    Math.abs(items[0].start) >
    boundaryTolerance
  ) {
    return {
      valid: false,
      error:
        "El Visual Plan no comienza al inicio del audio.",
    };
  }

  items[0].start = 0;

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];

    const boundaryDelta =
      current.start - previous.end;

    if (
      Math.abs(boundaryDelta) >
      boundaryTolerance
    ) {
      return {
        valid: false,
        error:
          "El Visual Plan contiene huecos o solapamientos entre segmentos.",
      };
    }

    /*
      Structured Outputs nos da la forma correcta,
      pero los floats pueden variar unas décimas.
      Unificamos únicamente diferencias pequeñas.
    */
    current.start = previous.end;
  }

  const lastItem = items[items.length - 1];

  if (
    Math.abs(
      lastItem.end - timelineDuration
    ) > boundaryTolerance
  ) {
    return {
      valid: false,
      error:
        "El Visual Plan no cubre el final completo del audio.",
    };
  }

  lastItem.end = timelineDuration;

  for (const item of items) {
    item.start =
      Math.max(
        0,
        Math.min(
          timelineDuration,
          Number(item.start.toFixed(3))
        )
      );

    item.end =
      Math.max(
        0,
        Math.min(
          timelineDuration,
          Number(item.end.toFixed(3))
        )
      );
  }

  return {
    valid: true,

    plan: {
      ...plan,
      duration:
        Number(
          timelineDuration.toFixed(3)
        ),
      items,
    },
  };
}

export async function POST(
  request: Request
) {
  try {
    const authenticated =
      await isAuthenticated();

    if (!authenticated) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY no está configurada.",
        },
        {
          status: 500,
        }
      );
    }

    const body = await request.json();

    const transcription =
      body?.transcription as
        | Transcription
        | undefined;

    if (!transcription) {
      return NextResponse.json(
        {
          error:
            "No se recibió la transcripción.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof transcription.text !==
        "string" ||
      !transcription.text.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "La transcripción está vacía.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Array.isArray(
        transcription.segments
      ) ||
      transcription.segments.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "La transcripción no contiene segmentos válidos.",
        },
        {
          status: 400,
        }
      );
    }

    const timelineDuration =
      getTimelineDuration(
        transcription
      );

    if (
      !Number.isFinite(
        timelineDuration
      ) ||
      timelineDuration <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo determinar la duración del audio.",
        },
        {
          status: 400,
        }
      );
    }

    const model =
      process.env
        .OPENAI_BROLL_MODEL ??
      process.env
        .OPENAI_EDITORIAL_MODEL ??
      "gpt-6-sol";

    const visualInstructions = `
You are the Visual Director for CutPilot's B-Roll Engine.

CutPilot is creating a short-form vertical voice-over video.
There is NO talking-head footage.
The supplied audio is the final narration.

Create a complete Visual Plan for the ENTIRE audio timeline.

Every second must have one meaningful visual action:
- BROLL
- IMPACT_WORD
- MOTION_GRAPHIC

There must be:
- no gaps
- no overlaps
- no TALKING_HEAD
- no empty visual sections

The first item MUST start at 0.
The final item MUST end at the supplied duration.
Every item must touch the next item exactly.
Items must be chronological.

Normal visual segments should usually last about 2-5 seconds.
Use shorter or longer segments only when the meaning requires it.
Divide by meaning, not arbitrary time.

The transcript field must represent the spoken content in that item's range.
Do not invent or paraphrase facts.

VISUAL TYPE SELECTION

Prefer BROLL when the viewer benefits from seeing a real:
- product
- device
- feature
- interface
- physical detail
- camera
- design element
- real-world action
- environment

Use IMPACT_WORD sparingly when a short phrase deserves strong emphasis.
IMPACT_WORD is an overlay on top of B-roll, not a replacement for B-roll.

Use MOTION_GRAPHIC when a generated visual explains the spoken idea more clearly than real B-roll.

Motion Graphics are selective visual punctuation, but DO NOT underuse them.

Do not use MOTION_GRAPHIC merely because the narration contains a number, list or comparison.

However, when the narration contains a HIGH-CONFIDENCE Motion Graphic opportunity, prefer MOTION_GRAPHIC over generic B-roll.

HIGH-CONFIDENCE MOTION GRAPHIC OPPORTUNITIES

A high-confidence opportunity exists when one of these structures is explicitly present in the narration:

1. A meaningful numerical change, before/after metric, or measurable contrast:
   - time reduced
   - money saved
   - price difference
   - percentage change
   - quantity change
   - speed multiplier
   → Prefer STAT_CALLOUT.

2. A direct comparison between exactly TWO identifiable products, approaches, versions, options or states with explicit differences:
   → Prefer COMPARISON.

3. A clearly spoken chronological or dependent sequence of 3 to 5 steps:
   → Prefer PROCESS_FLOW.

4. A clearly spoken list of 2 to 5 parallel reasons, benefits, drawbacks, mistakes, requirements, features or takeaways:
   → Prefer KEY_POINTS.

5. An explicit contrast between TWO website/landing-page states where page structure,
   hierarchy or conversion direction is the point:
   → Prefer WEB_COMPARISON over generic B-roll or regular COMPARISON.

For videos longer than approximately 30 seconds:
- If at least one high-confidence Motion Graphic opportunity exists, normally include at least 1 MOTION_GRAPHIC.
- Prefer approximately 1-3 Motion Graphics in a typical short when the narration genuinely supports them.
- This is NOT a quota. Never invent or force Motion Graphics only to satisfy a count.
- Avoid placing Motion Graphics back-to-back unless the narration genuinely benefits from consecutive generated visuals.
- Prefer the strongest opportunities and let B-roll handle the rest.

When choosing between a strong structured Motion Graphic and generic B-roll:
- choose MOTION_GRAPHIC when it improves comprehension
- choose BROLL when seeing a real product, interface, device, environment or physical action is more informative

Example:

Narration:
"Antes este trabajo me tomaba veinte horas. Ahora con IA puedo hacerlo en diez."

Prefer:
MOTION_GRAPHIC / STAT_CALLOUT

motionGraphic:
{
  "type": "STAT_CALLOUT",
  "label": "TIEMPO DE TRABAJO",
  "primary": "20 HORAS",
  "secondary": "10 HORAS"
}

Do NOT default to generic laptop or coding B-roll for that exact numerical before/after statement.

BROLL RULES

For BROLL and IMPACT_WORD:
broll MUST contain:
- subject
- intent
- concepts

SUBJECT = the concrete entity to show.
INTENT = what the viewer should SEE.
CONCEPTS = searchable visual details, actions, features or environments.

Prefer concrete canonical subjects.
Keep known product/model names stable across nearby items while the narration is still about them.
Never output filenames, paths, asset IDs or folder names.

Good subjects:
"iPhone 13"
"iPhone 15 Pro"
"MacBook"
"Apple Watch"
"smartphone"
"laptop"

Good intents:
"close-up of the camera system while discussing photography"
"show the phone being used to record vertical video"
"show a creator editing video on a laptop"

Do not repeat the same generic shot when the narration supports variation.

For BROLL:
- broll MUST NOT be null
- impactText MUST be null
- motionGraphic MUST be null

IMPACT_WORD RULES

Use IMPACT_WORD only for a short memorable phrase such as:
- decisive conclusion
- warning
- major price
- surprising statement
- memorable claim

impactText should normally be 2-5 words.

For IMPACT_WORD:
- broll MUST NOT be null
- impactText MUST NOT be null
- motionGraphic MUST be null

AUTO MOTION GRAPHICS

Available types:
- STAT_CALLOUT
- COMPARISON
- PROCESS_FLOW
- KEY_POINTS
- WEB_COMPARISON

Do NOT request any other Motion Graphic type.

Motion Graphic data describes WHAT should be communicated.
Do NOT describe colors, fonts, positions, easing, HTML, CSS, Canvas or rendering implementation.

For MOTION_GRAPHIC:
- motionGraphic MUST NOT be null
- broll MUST be null
- impactText MUST be null

STAT_CALLOUT

Use for an important measurable idea:
- time
- money
- price
- percentage
- quantity
- increase/decrease
- before/after numerical change
- important standalone statistic

Do not use merely because a number appears.
Do not invent numbers.

Example:
"Antes tardaba tres horas y ahora veinte minutos."

{
  "type": "STAT_CALLOUT",
  "label": "TIEMPO DE EDICIÓN",
  "primary": "3 HORAS",
  "secondary": "20 MIN"
}

COMPARISON

Use when the narration clearly compares exactly TWO identifiable options, products, versions, approaches or states.

Fields:
- leftTitle
- leftDetail or null
- rightTitle
- rightDetail or null
- emphasis: LEFT, RIGHT or NEUTRAL

Use LEFT or RIGHT only when the speaker clearly favors that side.
Do not infer a winner from general knowledge.
Do not invent specifications or advantages.

PROCESS_FLOW

Use only for a chronological or dependent sequence of 3 to 5 steps.

Each step:
- title
- detail or null

Preserve spoken order.
Do not invent missing steps.
Do not use PROCESS_FLOW for parallel reasons, benefits or features.

KEY_POINTS

Use for 2 to 5 parallel ideas that belong to the same conceptual list but do NOT form a sequence.

Examples:
- reasons
- benefits
- drawbacks
- mistakes
- requirements
- features
- takeaways

Each point:
- title
- detail or null

Preserve spoken order.
Do not invent extra points.
Do not use KEY_POINTS for chronological steps.
Do not use KEY_POINTS for direct A-vs-B comparison.
Do not use KEY_POINTS for one statistic.


WEB_COMPARISON

Use when the narration explicitly contrasts TWO website or landing-page
approaches/states and showing fictional page mockups improves comprehension.

Strong cases:
- overloaded website vs goal-focused website
- unclear or missing hero vs focused conversion hero
- many competing icons/CTAs vs one clear primary CTA
- website without direction vs website built to drive WhatsApp
- website without direction vs website built to book an appointment

Prefer WEB_COMPARISON over regular COMPARISON when the key idea is visual website
structure, hierarchy or conversion direction.

Fields:
- label: short context label or null
- leftTitle: concise label for the problematic / less-directed page
- leftHeadline: short illustrative headline for the fictional left page
- leftIssues: 2 to 3 concise transcript-supported issues
- rightTitle: concise label for the focused / goal-driven page
- rightHeadline: short illustrative headline for the fictional right page
- rightStrengths: 2 to 3 concise transcript-supported strengths
- rightCta: transcript-supported CTA such as "WHATSAPP" or "AGENDAR CITA", or null

Rules:
- The page mockups are FICTIONAL examples, not real websites.
- Do not invent brands, products, prices, statistics, guarantees or business claims.
- Headlines may be concise illustrative UI copy derived from the spoken idea, but
  they must not introduce new factual claims.
- Do not use WEB_COMPARISON merely because a website is mentioned.
- Do not use it without a meaningful two-state web contrast.
- If the viewer needs to see a REAL interface, prefer BROLL.
- A WEB_COMPARISON segment may be somewhat longer than the normal 2-5 seconds
  when necessary to communicate both sides of one coherent comparison.

Example:
"Una página sin dirección puede tener un hero sobrecargado y demasiados íconos.
Una página con objetivo tiene un hero claro y te lleva a WhatsApp o a agendar."

{
  "type": "WEB_COMPARISON",
  "label": "SIN DIRECCIÓN VS CON OBJETIVO",
  "leftTitle": "SIN DIRECCIÓN",
  "leftHeadline": "TODO EN UN SOLO LUGAR",
  "leftIssues": [
    "HERO SATURADO",
    "DEMASIADOS ÍCONOS",
    "SIN JERARQUÍA"
  ],
  "rightTitle": "CON OBJETIVO",
  "rightHeadline": "AGENDA TU CONSULTA",
  "rightStrengths": [
    "HERO CLARO",
    "CTA PRINCIPAL",
    "ENFOQUE EN CONVERSIÓN"
  ],
  "rightCta": "AGENDAR CITA"
}

GENERAL RULES

Do not invent:
- products
- models
- prices
- claims
- statistics
- features
- workflow steps
- list items

Write a short reason explaining why each visual choice fits that moment.

Before finalizing, audit:
- first item starts at 0
- final item ends at duration
- all adjacent boundaries are contiguous
- every second is covered
- no TALKING_HEAD
- BROLL items contain broll only
- IMPACT_WORD items contain broll + impactText
- MOTION_GRAPHIC items contain motionGraphic only
- Motion Graphics are selective
- high-confidence Motion Graphic opportunities were not ignored in favor of generic B-roll
- explicit website structure/conversion contrasts were evaluated for WEB_COMPARISON
- videos longer than approximately 30 seconds normally include at least 1 MOTION_GRAPHIC when a high-confidence opportunity exists
- visual ideas vary when supported

Return one complete Visual Plan for the supplied transcript.

${motionPackPlannerRules}
`;

    const transcriptForModel = {
      language:
        transcription.language,

      duration:
        timelineDuration,

      fullText:
        transcription.text,

      segments:
        transcription.segments.map(
          (segment) => ({
            start:
              segment.start,

            end:
              segment.end,

            text:
              segment.text,
          })
        ),
    };

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          model,

          reasoning: {
            effort: "medium",
          },

          instructions:
            visualInstructions,

          input: [
            {
              role: "user",

              content: [
                {
                  type: "input_text",

                  text:
                    JSON.stringify(
                      transcriptForModel
                    ),
                },
              ],
            },
          ],

          text: {
            format: {
              type: "json_schema",

              name:
                "cutpilot_visual_plan",

              strict: true,

              schema:
                visualPlanSchema,
            },
          },
        }),
      }
    );

    const data =
      (await response.json()) as
        OpenAIResponse;

    if (!response.ok) {
      console.error(
        "B-Roll Visual Planner error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo generar el Visual Plan.",
        },
        {
          status:
            response.status,
        }
      );
    }

    let outputText:
      | string
      | null = null;

    for (const output of
      data.output ?? []) {
      if (
        output.type !==
        "message"
      ) {
        continue;
      }

      for (const content of
        output.content ?? []) {
        if (
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string"
        ) {
          outputText =
            content.text;

          break;
        }
      }

      if (outputText) {
        break;
      }
    }

    if (!outputText) {
      console.error(
        "B-Roll Visual Planner returned no output:",
        data
      );

      return NextResponse.json(
        {
          error:
            "El B-Roll Engine no devolvió un Visual Plan.",
        },
        {
          status: 500,
        }
      );
    }

    let visualPlan:
      VisualPlan;

    try {
      visualPlan =
        JSON.parse(
          outputText
        ) as VisualPlan;
    } catch {
      console.error(
        "Invalid Visual Plan JSON:",
        outputText
      );

      return NextResponse.json(
        {
          error:
            "El B-Roll Engine devolvió un Visual Plan inválido.",
        },
        {
          status: 500,
        }
      );
    }

    const validation =
      normalizeAndValidatePlan(
        visualPlan,
        timelineDuration
      );

    if (!validation.valid) {
      console.error(
        "Visual Plan timeline validation failed:",
        validation.error,
        visualPlan
      );

      return NextResponse.json(
        {
          error:
            validation.error,
        },
        {
          status: 422,
        }
      );
    }

    return NextResponse.json(
      validation.plan
    );
  } catch (error) {
    console.error(
      "CutPilot B-Roll Visual Planner error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al generar el Visual Plan.",
      },
      {
        status: 500,
      }
    );
  }
}
