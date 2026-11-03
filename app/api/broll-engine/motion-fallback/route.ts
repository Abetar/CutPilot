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

type FallbackCandidate = {
  id: string;
  start: number;
  end: number;
  transcript: string;
  reason: string;
  broll: {
    subject: string | null;
    intent: string | null;
    concepts: string[];
  };
};

type FallbackDecision = {
  id: string;
  useMotion: boolean;
  motionGraphic: MotionGraphicRequest | null;
  reason: string;
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

const motionGraphicSchema = {
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
          enum: ["STAT_CALLOUT"],
        },
        label: {
          type: ["string", "null"],
        },
        primary: {
          type: "string",
        },
        secondary: {
          type: ["string", "null"],
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
          enum: ["COMPARISON"],
        },
        label: {
          type: ["string", "null"],
        },
        leftTitle: {
          type: "string",
        },
        leftDetail: {
          type: ["string", "null"],
        },
        rightTitle: {
          type: "string",
        },
        rightDetail: {
          type: ["string", "null"],
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
          enum: ["PROCESS_FLOW"],
        },
        label: {
          type: ["string", "null"],
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
                type: ["string", "null"],
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
          enum: ["KEY_POINTS"],
        },
        label: {
          type: ["string", "null"],
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
                type: ["string", "null"],
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
          enum: ["WEB_COMPARISON"],
        },
        label: {
          type: ["string", "null"],
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
          type: ["string", "null"],
        },
      },
    },
  ],
};

const fallbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "useMotion",
          "motionGraphic",
          "reason",
        ],
        properties: {
          id: {
            type: "string",
          },
          useMotion: {
            type: "boolean",
          },
          motionGraphic:
            motionGraphicSchema,
          reason: {
            type: "string",
          },
        },
      },
    },
  },
};

function extractOutputText(
  data: OpenAIResponse
) {
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
        return content.text;
      }
    }
  }

  return null;
}

function isValidCandidate(
  value: unknown
): value is FallbackCandidate {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate =
    value as Partial<FallbackCandidate>;

  return (
    typeof candidate.id ===
      "string" &&
    candidate.id.length > 0 &&
    typeof candidate.transcript ===
      "string" &&
    candidate.transcript.trim().length >
      0 &&
    typeof candidate.start ===
      "number" &&
    Number.isFinite(
      candidate.start
    ) &&
    typeof candidate.end ===
      "number" &&
    Number.isFinite(
      candidate.end
    ) &&
    candidate.end >
      candidate.start &&
    Boolean(candidate.broll)
  );
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

    const body =
      (await request.json()) as {
        items?: unknown;
      };

    const items:
      FallbackCandidate[] =
      Array.isArray(
        body.items
      )
        ? body.items.filter(
            isValidCandidate
          )
        : [];

    if (items.length === 0) {
      return NextResponse.json({
        items: [],
      });
    }

    /*
      Batch pequeño: evita una llamada por clip y también
      permite al modelo evitar Motion back-to-back cuando
      varios B-roll consecutivos fallaron al mismo tiempo.
    */
    const safeItems:
      FallbackCandidate[] =
      items.slice(0, 20);

    const model =
      process.env
        .OPENAI_BROLL_MODEL ??
      process.env
        .OPENAI_EDITORIAL_MODEL ??
      "gpt-6-sol";

    const instructions = `
You are CutPilot's Visual Fallback Resolver.

These segments were already classified as BROLL by the primary Visual Planner, but CutPilot's LOCAL B-roll matcher found ZERO sufficiently relevant assets for them.

Your job is NOT to force Motion Graphics.
Your job is to decide whether an existing structured Motion Graphic can safely replace the missing B-roll.

Available Motion Graphic types:
- STAT_CALLOUT
- COMPARISON
- PROCESS_FLOW
- KEY_POINTS
- WEB_COMPARISON

Return useMotion=true ONLY for HIGH-CONFIDENCE cases explicitly supported by the spoken transcript.

HIGH-CONFIDENCE RULES

STAT_CALLOUT:
Use for an important explicit measurable idea such as time, money, price, percentage, quantity, multiplier, increase/decrease or before/after numeric change.
Do not invent numbers.

COMPARISON:
Use only when exactly TWO identifiable options, approaches, versions or states are explicitly compared.
Do not invent differences or a winner.
Use NEUTRAL unless preference is explicit.

PROCESS_FLOW:
Use only when the narration explicitly gives a chronological or dependent sequence of 3 to 5 steps.
Preserve spoken order.
Do not turn parallel ideas into a process.

KEY_POINTS:
Use when the narration explicitly contains 2 to 5 parallel ideas, reasons, requirements, responsibilities, features, drawbacks or takeaways.
You may shorten wording into concise titles, but you MUST preserve the spoken meaning and MUST NOT add new facts.

WEB_COMPARISON:
Use when the failed B-roll segment explicitly contrasts TWO website/landing-page
states and a fictional simulated page comparison can communicate the idea better
than unrelated local B-roll.

Strong cases:
- overloaded / directionless website vs goal-focused website
- bad or unclear hero vs focused conversion hero
- competing icons/CTAs vs one clear CTA
- no conversion direction vs WhatsApp / appointment direction

Use regular COMPARISON instead when the contrast is not specifically about
website structure, hierarchy or conversion direction.

For WEB_COMPARISON:
- leftIssues and rightStrengths must contain 2 to 3 transcript-supported ideas
- leftHeadline/rightHeadline may be concise illustrative fictional UI copy, but
  must not add factual claims
- rightCta must be explicitly supported by the narration, or null
- never invent a brand, price, statistic, guarantee, product or offer
- do not imply the fictional mockups are real websites

Example:
"qué información pedir, dónde guardarla, qué pasa si falla, cómo se conecta con el resto del sistema"
→ HIGH-CONFIDENCE KEY_POINTS
Possible point titles derived only from the narration:
- QUÉ PEDIR
- DÓNDE GUARDARLO
- QUÉ PASA SI FALLA
- CÓMO SE CONECTA

Example WEB_COMPARISON:
"una página sin dirección tiene un hero sobrecargado y demasiados íconos,
mientras una página enfocada tiene un hero claro y lleva a WhatsApp"

→ HIGH-CONFIDENCE WEB_COMPARISON

If the transcript does not clearly fit one of the available structures:
- useMotion=false
- motionGraphic=null

This fallback exists because generic or unrelated B-roll is worse than leaving the item unresolved.
Never invent content just to avoid UNRESOLVED.

When multiple failed B-roll segments are adjacent, avoid converting every one into Motion. Prefer the strongest structured opportunities and avoid back-to-back Motion unless genuinely useful.

For useMotion=true:
- motionGraphic MUST be non-null
- use only information present in that item's transcript
- no design/CSS/rendering instructions

For useMotion=false:
- motionGraphic MUST be null

Return exactly one decision for every supplied id.

${motionPackPlannerRules}
`;

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
          instructions,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    JSON.stringify({
                      items: safeItems,
                    }),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name:
                "cutpilot_motion_fallback",
              strict: true,
              schema:
                fallbackSchema,
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
        "B-Roll Motion fallback OpenAI error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo resolver el fallback visual.",
        },
        {
          status:
            response.status,
        }
      );
    }

    const outputText =
      extractOutputText(data);

    if (!outputText) {
      return NextResponse.json(
        {
          error:
            "Motion fallback no devolvió una respuesta válida.",
        },
        {
          status: 500,
        }
      );
    }

    let parsed: {
      items: FallbackDecision[];
    };

    try {
      parsed =
        JSON.parse(
          outputText
        ) as {
          items:
            FallbackDecision[];
        };
    } catch {
      return NextResponse.json(
        {
          error:
            "Motion fallback devolvió JSON inválido.",
        },
        {
          status: 500,
        }
      );
    }

    const candidateIds =
      new Set(
        safeItems.map(
          (item) =>
            item.id
        )
      );

    const decisionById =
      new Map<string, FallbackDecision>();

    for (const decision of
      parsed.items ?? []) {
      if (
        !candidateIds.has(
          decision.id
        )
      ) {
        continue;
      }

      if (
        decision.useMotion &&
        isRenderableMotionRequest(decision.motionGraphic)
      ) {
        decisionById.set(
          decision.id,
          decision
        );
      } else {
        decisionById.set(
          decision.id,
          {
            id:
              decision.id,
            useMotion: false,
            motionGraphic: null,
            reason:
              decision.reason ||
              "No hay un Motion Graphic de alta confianza para este segmento.",
          }
        );
      }
    }

    /*
      Si el modelo omitiera un id por cualquier motivo,
      devolvemos NO fallback. Nunca inventamos una decisión.
    */
    const normalizedDecisions =
      safeItems.map(
        (item) =>
          decisionById.get(
            item.id
          ) ?? {
            id: item.id,
            useMotion: false,
            motionGraphic: null,
            reason:
              "No se obtuvo un fallback Motion seguro.",
          }
      );

    return NextResponse.json({
      items:
        normalizedDecisions,
    });
  } catch (error) {
    console.error(
      "CutPilot Motion fallback error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al resolver el fallback visual.",
      },
      {
        status: 500,
      }
    );
  }
}
