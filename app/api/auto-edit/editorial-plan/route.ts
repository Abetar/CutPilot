import {
  motionPackSchemas,
  motionPackPlannerRules,
  isRenderableMotionRequest,
} from "@/lib/motion/plannerPack";
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
          "motionGraphic",
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
              "MOTION_GRAPHIC",
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

10. Explicit A-versus-B discussion can remain on TALKING_HEAD when the
comparison is brief or personality-driven.

When both sides are clearly identifiable and a generated side-by-side visual
would improve comprehension, prefer:
action: "MOTION_GRAPHIC"
motionGraphic.type: "COMPARISON"

Do not choose MOTION_GRAPHIC merely because the word "versus" appears.

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

24. AUTO MOTION GRAPHICS

CutPilot can use MOTION_GRAPHIC when a spoken idea is better understood
through a generated visual instead of talking head or real B-roll.

The available Motion Graphic types are:

- STAT_CALLOUT
- COMPARISON
- PROCESS_FLOW
- KEY_POINTS
- WEB_COMPARISON

Do NOT request any other Motion Graphic type.

The Motion Graphic data describes WHAT should be communicated.

Do NOT describe:
- colors
- fonts
- positions
- animation easing
- HTML
- CSS
- Canvas instructions
- rendering implementation

CutPilot controls the visual design and animation.

25. MOTION GRAPHIC SELECTION RULES

Use MOTION_GRAPHIC only when it genuinely improves comprehension.

Prefer BROLL when the viewer benefits from seeing a real:
- product
- device
- feature
- interface
- physical detail
- camera
- design element
- real-world action

Prefer TALKING_HEAD when the value comes primarily from:
- personality
- opinion
- judgment
- emotion
- recommendation
- direct delivery

Motion Graphics are visual punctuation, not the default editing style.

Do not place them too frequently.

When action is MOTION_GRAPHIC:
- motionGraphic MUST NOT be null
- broll MUST be null

When action is NOT MOTION_GRAPHIC:
- motionGraphic MUST be null

26. STAT_CALLOUT

STAT_CALLOUT is appropriate for concise numerical or measurable ideas such as:
- time
- money
- prices
- percentages
- quantities
- increases
- decreases
- before/after numerical values
- an important standalone statistic

Do NOT use STAT_CALLOUT merely because a number appears.

The number should be important enough that visual emphasis improves
comprehension or retention.

Example:

Transcript:

"Antes tardaba tres horas editando y ahora puedo hacerlo en veinte minutos."

Valid:

action:
"MOTION_GRAPHIC"

motionGraphic:
{
  "type": "STAT_CALLOUT",
  "label": "TIEMPO DE EDICIÓN",
  "primary": "3 HORAS",
  "secondary": "20 MIN"
}

Do not invent numbers, prices, percentages or statistics.

27. COMPARISON

COMPARISON is appropriate when the narration clearly compares TWO identifiable
options, products, versions, approaches, states or alternatives and showing them
side-by-side makes the contrast easier to understand.

Examples:
- iPhone 15 Pro vs iPhone 16
- free plan vs paid plan
- manual editing vs CutPilot
- old workflow vs new workflow
- option A vs option B

COMPARISON must contain:

leftTitle:
the concise name of side A.

leftDetail:
one short detail explicitly supported by the transcript, or null.

rightTitle:
the concise name of side B.

rightDetail:
one short detail explicitly supported by the transcript, or null.

emphasis:
- "LEFT" only if the speaker clearly favors the left side.
- "RIGHT" only if the speaker clearly favors the right side.
- "NEUTRAL" when the narration does not clearly choose a winner.

Do NOT infer a winner from general knowledge.

Do NOT invent product advantages, specifications, prices or characteristics.

If the transcript only names the two sides but gives no useful differentiating
detail, set leftDetail and rightDetail to null.

Keep details concise. They are visual support, not subtitles.

Example:

Transcript:

"El iPhone 15 Pro tiene telefoto. El iPhone 16 tiene Camera Control.
Para mí el 15 Pro sigue siendo mejor compra."

Valid:

action:
"MOTION_GRAPHIC"

motionGraphic:
{
  "type": "COMPARISON",
  "label": "¿CUÁL CONVIENE?",
  "leftTitle": "iPhone 15 Pro",
  "leftDetail": "TELEFOTO",
  "rightTitle": "iPhone 16",
  "rightDetail": "CAMERA CONTROL",
  "emphasis": "LEFT"
}

For a neutral statement such as:

"El plan gratuito permite 3 proyectos y el Pro permite proyectos ilimitados."

Valid emphasis:
"NEUTRAL"

Do NOT use COMPARISON for:
- more than two sides
- vague comparisons with no identifiable A and B
- a single statistic
- workflows with three or more steps
- architecture diagrams

28. PROCESS_FLOW

PROCESS_FLOW is appropriate when the narration clearly describes a LINEAR
sequence of 3 to 5 meaningful steps and seeing those steps build in order makes
the explanation easier to follow.

Good examples:
- idea -> script -> record -> CutPilot -> publish
- upload -> transcribe -> edit -> render
- capture lead -> qualify -> follow up -> close
- install -> configure -> test -> deploy

PROCESS_FLOW must contain:

label:
a short context label, or null.

steps:
an ordered array of 3 to 5 objects.

Each step contains:
- title: a concise action or stage name.
- detail: one short supporting detail explicitly present in the transcript,
  or null.

Rules:

- Preserve the spoken order.
- Use only steps clearly supported by the transcript.
- Do NOT invent missing workflow stages.
- Do NOT transform a general list into a process unless the narration clearly
  implies order or progression.
- Keep step titles short, ideally 1 to 4 words.
- Keep detail concise; it is visual support, not a subtitle.
- Use 3 to 5 steps only.
- Do NOT use PROCESS_FLOW for branching logic.
- Do NOT use PROCESS_FLOW for architecture diagrams.
- Do NOT use PROCESS_FLOW for two-option comparisons.
- Do NOT use PROCESS_FLOW for a single before/after statistic.

Example:

Transcript:

"Primero escribo el guion, luego grabo, subo el video a CutPilot,
CutPilot lo edita y al final lo publico."

Valid:

action:
"MOTION_GRAPHIC"

motionGraphic:
{
  "type": "PROCESS_FLOW",
  "label": "MI FLUJO",
  "steps": [
    {
      "title": "GUION",
      "detail": null
    },
    {
      "title": "GRABAR",
      "detail": null
    },
    {
      "title": "CUTPILOT",
      "detail": "EDICIÓN AUTOMÁTICA"
    },
    {
      "title": "PUBLICAR",
      "detail": null
    }
  ]
}

29. KEY_POINTS

KEY_POINTS is appropriate when the narration presents 2 to 5 parallel ideas
that belong to the same conceptual list but do NOT represent a sequence.

Good examples:
- reasons
- benefits
- drawbacks
- mistakes
- requirements
- features
- things the speaker likes or dislikes
- key takeaways

KEY_POINTS must contain:

label:
a short context label, or null.

points:
an ordered array of 2 to 5 objects.

Each point contains:
- title: a concise phrase representing the point.
- detail: one short supporting detail explicitly present in the transcript,
  or null.

Rules:

- Preserve the spoken order.
- Use only points clearly supported by the transcript.
- Do NOT invent extra reasons, benefits, mistakes, features or requirements.
- Keep titles short, ideally 1 to 5 words.
- Keep details concise; they are visual support, not subtitles.
- Use 2 to 5 points only.
- Do NOT use KEY_POINTS when the narration clearly describes chronological
  steps or progression. Use PROCESS_FLOW instead.
- Do NOT use KEY_POINTS for two alternatives being directly compared.
  Use COMPARISON instead.
- Do NOT use KEY_POINTS for a single number or before/after statistic.
  Use STAT_CALLOUT instead.
- A sentence containing several commas is NOT automatically a list.
  The ideas must genuinely function as parallel points.

Example:

Transcript:

"Lo que más me gusta de CutPilot es que edito mucho más rápido,
mantengo un estilo consistente y ya no necesito abrir Premiere."

Valid:

action:
"MOTION_GRAPHIC"

motionGraphic:
{
  "type": "KEY_POINTS",
  "label": "POR QUÉ LO USO",
  "points": [
    {
      "title": "MÁS RÁPIDO",
      "detail": "MENOS EDICIÓN MANUAL"
    },
    {
      "title": "ESTILO CONSISTENTE",
      "detail": null
    },
    {
      "title": "SIN PREMIERE",
      "detail": null
    }
  ]
}


30. WEB_COMPARISON

WEB_COMPARISON is appropriate when the narration explicitly contrasts TWO
website or landing-page approaches/states and a simulated fictional web-page
mockup makes that contrast easier to understand than talking head, generic
B-roll or the simpler COMPARISON template.

Strong examples:
- overloaded website vs goal-focused website
- unclear or missing hero vs focused conversion hero
- many competing icons/CTAs vs one clear primary CTA
- website without direction vs website designed to get a WhatsApp message
- website without direction vs website designed to book an appointment

Prefer WEB_COMPARISON over COMPARISON when the important contrast is specifically
about the STRUCTURE, HIERARCHY or CONVERSION DIRECTION of a web page and showing
two fictional page mockups is the useful visual explanation.

Use regular COMPARISON for ordinary A-vs-B concepts, products, plans or workflows
that do not need a simulated website.

WEB_COMPARISON must contain:

label:
a short context label, or null.

leftTitle:
a concise label for the problematic / less-directed page.

leftHeadline:
short illustrative headline copy for the fictional left web mockup.

leftIssues:
2 to 3 concise issues explicitly supported by the narration.

rightTitle:
a concise label for the focused / goal-driven page.

rightHeadline:
short illustrative headline copy for the fictional right web mockup.

rightStrengths:
2 to 3 concise strengths explicitly supported by the narration.

rightCta:
the CTA explicitly supported by the narration, such as "WHATSAPP" or
"AGENDAR CITA", or null when no concrete CTA is stated.

Rules:

- The pages are FICTIONAL visual examples. Do not imply they are real sites.
- Preserve the speaker's actual contrast and direction.
- Do NOT invent brands, products, prices, statistics, guarantees or business claims.
- leftHeadline and rightHeadline may be concise illustrative UI copy derived from
  the spoken idea, but they must not introduce new factual claims.
- Use only issues/strengths supported by the transcript.
- Do NOT use WEB_COMPARISON merely because the speaker mentions a website.
- Do NOT use it when there is no meaningful two-state web contrast.
- Do NOT use it to reproduce a real website exactly. If seeing a real interface is
  important and available, prefer BROLL.
- A WEB_COMPARISON segment may be slightly longer than a normal insert when needed
  to cover both sides of one coherent comparison.

Example:

Transcript:

"Una página hecha sin dirección puede tener un hero sobrecargado,
tipografía pesada y demasiados íconos peleando por tu atención.
En cambio, una página dirigida a un objetivo tiene un hero claro
y elementos que te llevan a mandar WhatsApp o agendar una cita."

Valid:

action:
"MOTION_GRAPHIC"

motionGraphic:
{
  "type": "WEB_COMPARISON",
  "label": "SIN DIRECCIÓN VS CON OBJETIVO",
  "leftTitle": "SIN DIRECCIÓN",
  "leftHeadline": "TODO EN UN SOLO LUGAR",
  "leftIssues": [
    "HERO SATURADO",
    "TIPOGRAFÍA PESADA",
    "DEMASIADOS ÍCONOS"
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

Create a complete editorial plan for the supplied transcript.

${motionPackPlannerRules}
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

    if (!Array.isArray(editPlan?.items) || editPlan.items.some((item: { action?: string; motionGraphic?: unknown }) =>
      item.action === "MOTION_GRAPHIC" && !isRenderableMotionRequest(item.motionGraphic))) {
      return NextResponse.json({ error: "El plan contiene un Motion Graphic inválido." }, { status: 502 });
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