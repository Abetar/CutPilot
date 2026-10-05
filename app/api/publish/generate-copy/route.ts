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

type EditPlanItem = {
  id: string;
  start: number;
  end: number;
  transcript: string;
  action: string;
  effect: string;
  textOverlay: string | null;
  reason: string;
};

type EditPlan = {
  summary: string;
  items: EditPlanItem[];
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

const publishCopySchema = {
  type: "object",

  additionalProperties: false,

  required: [
    "youtubeTitle",
    "youtubeDescription",
    "youtubeTags",
    "tiktokCaption",
    "tiktokHashtags",
    "thumbnailText",
    "thumbnailSecond",
    "thumbnailReason",
  ],

  properties: {
    youtubeTitle: {
      type: "string",
    },

    youtubeDescription: {
      type: "string",
    },

    youtubeTags: {
      type: "array",

      items: {
        type: "string",
      },
    },

    tiktokCaption: {
      type: "string",
    },

    tiktokHashtags: {
      type: "array",

      items: {
        type: "string",
      },
    },

    thumbnailText: {
      type: "string",
    },

    thumbnailSecond: {
      type: "number",
    },

    thumbnailReason: {
      type: "string",
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

    const body =
      await request.json();

    const transcription =
      body?.transcription as
        | Transcription
        | undefined;

    const editPlan =
      body?.editPlan as
        | EditPlan
        | undefined;

    if (
      !transcription ||
      typeof transcription.text !==
        "string" ||
      !transcription.text.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "No se recibió una transcripción válida.",
        },
        {
          status: 400,
        }
      );
    }

    const duration =
      typeof transcription.duration ===
        "number" &&
      Number.isFinite(
        transcription.duration
      )
        ? transcription.duration
        : Math.max(
            0,
            ...(
              transcription.segments ??
              []
            ).map(
              (segment) =>
                Number.isFinite(
                  segment.end
                )
                  ? segment.end
                  : 0
            )
          );

    const model =
      process.env
        .OPENAI_PUBLISH_MODEL ??
      process.env
        .OPENAI_EDITORIAL_MODEL ??
      "gpt-6-sol";

    const instructions = `
You are the publishing copy engine for CutPilot.

CutPilot prepares short-form vertical technology videos for
YouTube Shorts and TikTok.

Generate platform-specific publishing copy from ONLY the supplied
transcript and editorial context.

GOAL:
Improve packaging, clarity, curiosity and click-through potential
without making false promises, inventing facts, or using deceptive
clickbait.

GENERAL RULES:

1. Preserve the video's actual point of view and conclusion.
2. Do not invent specifications, prices, products, comparisons or claims.
3. Prefer concrete product/model names when the transcript contains them.
4. Avoid generic AI-sounding wording.
5. Avoid exaggerated phrases such as:
   - "you won't believe"
   - "this changes everything"
   - "the secret nobody tells you"
   unless the transcript genuinely supports that idea.
6. Do not promise virality or views.
7. Write in the same language as the transcript unless the content itself
   clearly calls for another language.
8. The creator's style is direct technology commentary:
   purchase decisions, real-world tradeoffs, misconceptions,
   comparisons, value and consequences.

YOUTUBE SHORTS:

youtubeTitle:
- Maximum 100 characters.
- Prefer roughly 45-75 characters when possible.
- Put the strongest searchable entity or product early.
- Create curiosity through a real tension, consequence or decision.
- Do not add "#Shorts" to the title.
- Do not write in ALL CAPS.

youtubeDescription:
- Keep it concise.
- Usually 2-4 short lines.
- Explain what decision, comparison or takeaway the video covers.
- Include natural search terms from the transcript.
- End with a small relevant hashtag set when useful.
- Do not keyword-stuff.

youtubeTags:
- 4-8 concise tags.
- No leading #.
- Use only terms clearly supported by the video.

TIKTOK:

tiktokCaption:
- Short and conversational.
- Strong first sentence.
- Make the viewer understand the tension or decision quickly.
- Do not copy the YouTube title verbatim.
- Do not include hashtags inside this field.

tiktokHashtags:
- 3-6 relevant hashtags.
- Include the leading #.
- Prefer specific topic/product hashtags over generic spam.
- Avoid filler such as #fyp or #viral unless genuinely useful; normally omit them.

THUMBNAIL / COVER:

thumbnailText:
- 2-5 words.
- It should complement the title, NOT repeat it.
- It must make sense even at small size.
- Prefer tension, consequence, comparison or purchase decision.
- No punctuation-heavy phrases.
- No fake claims.

thumbnailSecond:
- Recommend one timestamp in seconds from the supplied video.
- Must be >= 0 and <= video duration.
- Choose the moment most likely to make a useful cover frame based on
  the transcript + edit plan:
  recognizable product mention, strong comparison, expressive hook,
  important visual/product moment, or decisive statement.
- Avoid selecting the final fraction of the video.
- This is a semantic recommendation, not visual frame analysis.

thumbnailReason:
- One short sentence explaining why that timestamp is the best candidate.

Return ONLY the structured output.
`;

    const compactInput = {
      language:
        transcription.language,

      duration,

      transcript:
        transcription.text,

      segments:
        (
          transcription.segments ??
          []
        ).map(
          (segment) => ({
            start:
              segment.start,

            end:
              segment.end,

            text:
              segment.text,
          })
        ),

      editPlan: editPlan
        ? {
            summary:
              editPlan.summary,

            items:
              (
                editPlan.items ??
                []
              ).map(
                (item) => ({
                  start:
                    item.start,

                  end:
                    item.end,

                  transcript:
                    item.transcript,

                  action:
                    item.action,

                  effect:
                    item.effect,

                  textOverlay:
                    item.textOverlay,
                })
              ),
          }
        : null,
    };

    const response =
      await fetch(
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
                    type:
                      "input_text",

                    text:
                      JSON.stringify(
                        compactInput
                      ),
                  },
                ],
              },
            ],

            text: {
              format: {
                type:
                  "json_schema",

                name:
                  "cutpilot_publish_copy",

                strict: true,

                schema:
                  publishCopySchema,
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
        "Publish copy engine error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo generar el copy de publicación.",
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

    for (
      const output of
      data.output ?? []
    ) {
      if (
        output.type !==
        "message"
      ) {
        continue;
      }

      for (
        const content of
        output.content ?? []
      ) {
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
      return NextResponse.json(
        {
          error:
            "El generador no devolvió metadata.",
        },
        {
          status: 500,
        }
      );
    }

    let result: {
      youtubeTitle: string;
      youtubeDescription: string;
      youtubeTags: string[];
      tiktokCaption: string;
      tiktokHashtags: string[];
      thumbnailText: string;
      thumbnailSecond: number;
      thumbnailReason: string;
    };

    try {
      result =
        JSON.parse(
          outputText
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "El generador devolvió metadata inválida.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      Última protección:
      nunca dejamos un timestamp fuera del video.
    */
    result.thumbnailSecond =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            duration -
              0.1
          ),
          Number.isFinite(
            result.thumbnailSecond
          )
            ? result.thumbnailSecond
            : 0
        )
      );

    return NextResponse.json(
      result
    );
  } catch (error) {
    console.error(
      "CutPilot Publish Copy error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al generar la metadata de publicación.",
      },
      {
        status: 500,
      }
    );
  }
}
