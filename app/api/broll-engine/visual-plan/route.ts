import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

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
  action: "BROLL" | "IMPACT_WORD";
  broll: {
    subject: string | null;
    intent: string | null;
    concepts: string[];
  };
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
            ],
          },

          broll: {
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
      item.action === "IMPACT_WORD" &&
      (!item.impactText ||
        !item.impactText.trim())
    ) {
      return {
        valid: false,
        error:
          "Un segmento IMPACT_WORD no contiene impactText.",
      };
    }

    if (
      item.action === "BROLL" &&
      item.impactText !== null
    ) {
      item.impactText = null;
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
You are the B-Roll Engine for CutPilot.

CutPilot is creating a short-form vertical voice-over video.

There is NO talking-head footage.

The supplied audio is already the final narration.

Your job is to create a complete Visual Plan for the ENTIRE audio timeline.

Every second must have a meaningful B-roll visual underneath it.

IMPACT_WORD is an overlay style, NOT a replacement for B-roll.
Every item, including IMPACT_WORD items, must include a valid semantic B-roll request.

CORE TIMELINE RULES:

1. COVER 100% OF THE AUDIO.

The first item MUST start at 0.

The final item MUST end at the supplied duration.

Every item must touch the next item exactly.

There must be:
- no gaps
- no overlaps
- no uncovered silence
- no TALKING_HEAD
- no empty visual sections

2. Items must be ordered chronologically.

3. Normal visual segments should usually last approximately 2-5 seconds.

This is a pacing guideline, not a quota.

A short visual may be approximately 1.5-2 seconds when useful.

A longer visual may be approximately 5-6 seconds when one coherent idea deserves it.

Avoid frantic changes every second.

Avoid leaving one visual unchanged for a long stretch when the narration clearly moves to another idea.

4. Divide the narration by MEANING, not by arbitrary time intervals.

A visual change should normally happen when:
- the product changes
- the feature changes
- the use case changes
- the sentence introduces a new concrete idea
- a strong statement deserves emphasis
- the visual intent meaningfully changes

5. The transcript field must represent the spoken content covered by that item's time range.

Do not invent or paraphrase facts.

6. Every item must include a semantic B-roll request.

The B-roll request has three fields with DIFFERENT responsibilities:

SUBJECT = WHAT concrete entity should appear.
INTENT = WHAT the viewer should SEE that entity doing or communicating.
CONCEPTS = searchable visual details, actions, features or environments.

SUBJECT RULES:

- Prefer a concrete canonical entity.
- If a specific product or model is established by the narration, keep that exact product/model across nearby sentences while the narration is still discussing it.
- Do not replace a known product with an abstract workflow description.
- Keep subject short.
- Never put filenames, paths, asset IDs or invented library entries in subject.

GOOD SUBJECTS:
"iPhone 13"
"iPhone 15 Pro"
"MacBook"
"Apple Watch"
"smartphone"
"laptop"

BAD SUBJECTS:
"person using technology efficiently"
"professional content creation workflow"
"social media editing process"

INTENT RULES:

Intent should describe what the viewer should SEE.

GOOD:
"close-up of the camera system while discussing photography"
"show the phone being used to record vertical video"
"show a creator editing video on a laptop"

BAD:
"show technology"
"show iPhone"

CONCEPT RULES:

Concepts should contain useful searchable visual details such as:
- feature
- physical detail
- action
- use case
- shot type
- interface
- environment
- workflow

Do not fill concepts mostly with repetitions of the subject.

7. Do NOT choose real CutPilot files.

Never output:
- filenames
- paths
- asset IDs
- folder names

You are defining visual intent only.

CutPilot will resolve your semantic requests against its local B-roll library later.

8. Maintain narrative subject continuity.

Example:

"El iPhone 13 sigue funcionando muy bien.
Sus cámaras todavía son buenas.
Y para redes sociales sigue siendo suficiente."

All three statements may still use:

subject:
"iPhone 13"

with different intent/concepts.

Do not switch subject to:
"social media workflow"

unless the narration truly changes subject.

9. Vary the visual intent.

Do not request the same generic product shot repeatedly.

If the narration supports it, vary between:
- product hero shot
- camera close-up
- screen usage
- handheld use
- photography
- video recording
- editing workflow
- physical design
- accessories
- store or buying context

10. IMPACT_WORD is optional and should be sparse.

Use action IMPACT_WORD only when a short phrase deserves strong visual emphasis, such as:
- a decisive conclusion
- a surprising statement
- an important price
- a major warning
- a strong comparison
- a memorable claim

impactText should normally be approximately 2-5 words.

Examples:
"SIGUE SIENDO BUENO"
"NO VALE LA PENA"
"$15,000 PESOS"
"EL GRAN PROBLEMA"

For normal BROLL items:
impactText MUST be null.

For IMPACT_WORD items:
impactText MUST contain the short overlay text.

Even an IMPACT_WORD item still requires a B-roll request because the B-roll remains underneath the overlay.

11. Do not invent facts, products, models, prices or claims that are absent from the narration.

12. Write a short reason explaining why each visual choice fits that exact moment.

13. Before finalizing, mentally audit the complete timeline.

Verify:
- first item starts at 0
- final item ends at the supplied duration
- every adjacent boundary is contiguous
- every second is covered
- every item contains B-roll intent
- there is no TALKING_HEAD
- IMPACT_WORD is used sparingly
- visual ideas vary when the narration supports it

Return one complete Visual Plan for the supplied transcript.
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
