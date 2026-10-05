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

const editPlanSchema = {
  type: "object",

  additionalProperties: false,

  required: [
    "summary",
    "items",
  ],

  properties: {
    summary: {
      type: "string",
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
          "effect",
          "textOverlay",
          "broll",
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
              "TALKING_HEAD",
              "BROLL",
              "KEY_STATEMENT",
              "COMPARISON",
              "PRICE",
              "QUESTION",
              "PRODUCT_NAME",
            ],
          },

          effect: {
            type: "string",

            enum: [
              "NONE",
              "SUBTLE_PUNCH_IN",
              "KEY_STATEMENT",
              "PRICE",
              "COMPARISON",
              "QUESTION",
              "PRODUCT_NAME",
            ],
          },

          textOverlay: {
            type: [
              "string",
              "null",
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

          reason: {
            type: "string",
          },
        },
      },
    },
  },
};

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
      )
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

    /*
      Dejamos el modelo configurable para
      poder probar calidad/coste posteriormente
      sin cambiar código.
    */
    const model =
      process.env
        .OPENAI_EDITORIAL_MODEL ??
      "gpt-6-sol";

    const editorialInstructions = `
You are the Editorial Engine for CutPilot.

CutPilot edits short-form vertical talking-head technology videos.

The speaker remains the personality and narrative anchor of the video,
but CutPilot should actively use visual variety when the spoken content
can be illustrated meaningfully.

Your job is NOT to maximize effects.

Your job is to create a coherent, engaging edit plan that improves:
- pacing
- visual variety
- comprehension
- retention
- product context

without making the video feel over-edited.

EDITORIAL PRINCIPLES:

1. Keep the speaker visible when the value of the moment comes primarily
from their personality, emotion, opinion, judgment or direct delivery.

This is especially appropriate when they are:
- giving a personal opinion
- making a judgment
- giving a recommendation
- delivering a conclusion
- speaking directly to the viewer
- making an important rhetorical statement

However, do NOT interpret this as "default to TALKING_HEAD whenever unsure."

If the spoken idea can be illustrated with useful product or contextual
visuals, B-roll should be seriously considered.

2. Actively look for B-roll opportunities when the speaker discusses
something that benefits from visual context.

Especially consider B-roll for:
- specific products
- smartphones
- iPhones
- Apple products
- cameras
- video recording
- photography
- editing
- content creation
- design
- materials
- screens
- connectors
- USB-C
- buttons
- battery
- software
- apps
- interfaces
- stores
- product displays
- buying situations
- product comparisons
- physical product features
- professional use cases
- workflows
- accessories
- hardware

3. B-roll does NOT require the speaker to literally name a visual object
in every sentence.

Use the meaning of the sentence.

Example:

Transcript:
"si no grabas video profesional, no editas"

This can justify B-roll showing:
- smartphone camera usage
- video recording
- editing workflow
- content creation
- professional smartphone use

even if the sentence does not repeat the product name.

4. B-roll must add meaningful visual context.

Do NOT request B-roll merely because a keyword exists.

The visual should help the viewer:
- understand the idea
- see the product
- understand a feature
- visualize a use case
- compare products
- maintain visual interest

5. VISUAL PACING IS IMPORTANT.

For a typical 20-60 second technology talking-head video, actively scan
the full timeline for multiple legitimate opportunities for visual change.

When the content supports it, a useful visual change will often happen
roughly every 4-7 seconds.

This is a pacing guideline, NOT a quota.

Do not create meaningless B-roll just to satisfy a timer.

But also avoid leaving long stretches of approximately 8-12+ seconds as
only TALKING_HEAD when the transcript contains clearly visualizable
technology, product or use-case content.

6. A short technology video with several visualizable ideas will often
reasonably contain multiple B-roll moments.

For example, a 20-30 second product commentary video might naturally
contain approximately 2-4 B-roll opportunities.

A 45-60 second video may naturally contain more.

These are NOT mandatory counts.

Content meaning always wins.

The purpose of this rule is to prevent being unnecessarily conservative
with B-roll.

7. B-roll normally should occupy approximately 2-5 seconds.

Use shorter ranges when a quick visual insert is enough.

Avoid unnecessarily covering long sections of the speaker.

8. The first 3 seconds are especially important.

The hook may use:
- SUBTLE_PUNCH_IN
- KEY_STATEMENT
- strong text
- recognizable product B-roll

Do not automatically hide the speaker during the hook.

9. Important statements can use KEY_STATEMENT.

Use this when the wording itself deserves emphasis.

KEY_STATEMENT should not prevent nearby B-roll from being used later if
the following content becomes visually demonstrable.

10. Explicit product-versus-product discussion can use COMPARISON.

11. Important prices can use PRICE.

12. A strong final question can use QUESTION.

13. Product/model names can use PRODUCT_NAME when emphasizing the exact
name genuinely improves comprehension.

14. TALKING_HEAD with effect NONE is valid.

Not every moment needs:
- an effect
- text
- B-roll

However, TALKING_HEAD should be an editorial decision, not simply the
safest default.

15. Do not repeat the same visual idea unnecessarily.

If multiple B-roll moments are requested, vary their visual intent when
possible.

Example:

Instead of repeatedly requesting:
"iPhone 15 Pro product shot"

prefer useful variation such as:
- camera close-up
- phone being used to record video
- editing workflow
- physical design
- store display

when supported by the transcript.

16. Coherence is more important than effect quantity.

17. Do not invent facts that are not present in the transcript.

18. Do not invent products or models.

19. The timestamps in the edit plan must remain within the supplied
transcript timing.

20. Cover the complete narrative timeline.

Do not analyze only the beginning of the video.

Evaluate every supplied transcript segment for:
- talking-head value
- visual potential
- emphasis potential
- comparison
- question
- product context

21. A BROLL action must include a useful semantic request.

The three B-roll fields have DIFFERENT responsibilities:

SUBJECT = WHAT concrete entity should appear.
INTENT = WHAT that entity should be doing or communicating.
CONCEPTS = searchable visual attributes, actions and details.

SUBJECT RULES:

- Prefer a concrete, canonical entity.
- If a specific product/model is known from the current narrative context,
  use that exact product/model.
- Maintain subject continuity across nearby sentences when the speaker is
  clearly still discussing the same product.
- The product does NOT need to be repeated literally in every sentence.
- Do not replace a known concrete product with an abstract description of
  the activity being discussed.
- Keep subject short.
- Do not put actions, workflows, editorial goals or long descriptions in
  subject.

GOOD SUBJECTS:

"iPhone 15 Pro"
"iPhone 16"
"MacBook"
"Apple Watch"
"smartphone"

BAD SUBJECTS:

"flujo de creación de contenido con smartphone"
"persona editando para redes sociales"
"grabación profesional de video"
"uso del teléfono para crear contenido"
"workflow de edición"

Those belong in intent or concepts, NOT subject.

CONTEXT CONTINUITY EXAMPLE:

Transcript:

"El iPhone 15 Pro tiene capacidades profesionales.
Si no grabas video profesional, no editas
o no te dedicas a las redes sociales..."

The later sentences are still discussing the iPhone 15 Pro.

Therefore valid B-roll requests would be:

BROLL 1:

subject:
"iPhone 15 Pro"

intent:
"show the phone being used for professional video recording"

concepts:
[
  "video recording",
  "camera usage",
  "content creation",
  "smartphone filmmaking"
]

BROLL 2:

subject:
"iPhone 15 Pro"

intent:
"show a video editing or social media content workflow involving the phone"

concepts:
[
  "video editing",
  "content creator",
  "social media",
  "editing interface"
]

Do NOT change the second subject to:

"content creation workflow with smartphone"

because that describes the visual intent, not the entity.

If there is genuinely no identifiable concrete entity in the surrounding
context, use the most concrete generic subject available.

Example:

subject:
"smartphone"

is preferable to:

subject:
"mobile content creation workflow"

INTENT RULES:

Intent should describe what the viewer should SEE and what that visual
communicates.

BAD:

"show iPhone"

BETTER:

"show the phone being used for professional video recording"

BETTER:

"close-up of the camera system while discussing video capabilities"

CONCEPT RULES:

Concepts should describe useful searchable elements such as:

- feature
- action
- activity
- use case
- physical detail
- shot type
- interface
- environment

Do not fill concepts mostly with repetitions of the subject.

Example:

Transcript:
"El iPhone 16 agregó el botón de control de cámara"

Good request:

subject:
"iPhone 16"

intent:
"show the camera control button and how it relates to taking photos"

concepts:
[
  "camera control",
  "camera button",
  "closeup",
  "photography"
]

22. The reason field is for CutPilot's internal review.

Keep it short and concrete.

Explain why the visual decision improves that specific moment.

23. Before finalizing the plan, mentally review the entire timeline.

Ask:

- Are there long talking-head stretches that could benefit from useful
  visual context?
- Did I miss a product feature or use case that can be illustrated?
- Did I preserve the speaker for opinions and personality?
- Is each B-roll request visually specific?
- Does the video have enough visual rhythm without becoming noisy?

Create a complete editorial plan for the supplied transcript.
`;

    const transcriptForModel = {
      language:
        transcription.language,

      duration:
        transcription.duration,

      fullText:
        transcription.text,

      segments:
        transcription.segments.map(
          (segment) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text,
          })
        ),
    };

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          model,

          /*
            Medium reasoning because editorial
            decisions are one of CutPilot's
            core quality differentiators.
          */
          reasoning: {
            effort: "medium",
          },

          instructions:
            editorialInstructions,

          input: [
            {
              role: "user",

              content: [
                {
                  type: "input_text",

                  text: JSON.stringify(
                    transcriptForModel
                  ),
                },
              ],
            },
          ],

          /*
            Structured Outputs prevents the
            model from returning arbitrary JSON
            that does not match our EditPlan type.
          */
          text: {
            format: {
              type: "json_schema",

              name: "cutpilot_edit_plan",

              strict: true,

              schema:
                editPlanSchema,
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
        "Editorial Engine error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo generar el Edit Plan.",
        },
        {
          status: response.status,
        }
      );
    }

    /*
      Buscamos el output_text dentro
      de los items devueltos por
      Responses API.
    */
    let outputText: string | null =
      null;

    for (const output of
      data.output ?? []) {
      if (
        output.type !== "message"
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
        "Editorial Engine returned no output:",
        data
      );

      return NextResponse.json(
        {
          error:
            "El Editorial Engine no devolvió un plan.",
        },
        {
          status: 500,
        }
      );
    }

    let editPlan;

    try {
      editPlan =
        JSON.parse(outputText);
    } catch {
      console.error(
        "Invalid Edit Plan JSON:",
        outputText
      );

      return NextResponse.json(
        {
          error:
            "El Editorial Engine devolvió un plan inválido.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      editPlan
    );
  } catch (error) {
    console.error(
      "CutPilot Editorial Engine error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al generar el Edit Plan.",
      },
      {
        status: 500,
      }
    );
  }
}