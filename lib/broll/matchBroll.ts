import type {
  BrollAsset,
  BrollCatalog,
} from "@/lib/broll/types";

export type BrollMatchRequest = {
  subject: string | null;
  intent: string | null;
  concepts: string[];
};

export type BrollMatch = {
  asset: BrollAsset;
  score: number;
  reasons: string[];
};

/*
  Palabras que no aportan suficiente significado
  visual como para influir en el matching.

  También eliminamos boilerplate que actualmente
  existe en varias descripciones del catálogo.
*/
const STOP_WORDS = new Set([
  // Español
  "a",
  "al",
  "algo",
  "como",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "por",
  "que",
  "se",
  "sin",
  "su",
  "sus",
  "un",
  "una",
  "uno",
  "y",

  // Verbos editoriales genéricos
  "mostrar",
  "muestra",
  "mostrando",
  "ver",
  "viendo",
  "utilizar",
  "utilizando",
  "usar",
  "usando",
  "uso",

  // Boilerplate frecuente del catálogo
  "real",
  "foto",
  "fotos",
  "animada",
  "animado",
  "movimiento",
  "anadido",
  "anadida",
  "captura",
  "credito",
  "archivo",
  "familia",
  "modelo",
  "confirmar",
  "confirmado",

  // Inglés
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "show",
  "showing",
  "use",
  "using",
  "while",
]);

/*
  Equivalencias semánticas simples.

  Todavía NO usamos embeddings, pero esto
  ayuda a cruzar español e inglés.
*/
const SEMANTIC_ALIASES: Record<
  string,
  string
> = {
  camara: "camera",
  camaras: "camera",
  cameras: "camera",
  camera: "camera",

  grabacion: "recording",
  grabar: "recording",
  grabando: "recording",
  rodaje: "recording",
  filming: "recording",
  recording: "recording",

  editar: "editing",
  editando: "editing",
  edicion: "editing",
  edit: "editing",
  editing: "editing",

  fotografia: "photo",
  fotografias: "photo",
  photography: "photo",
  photo: "photo",

  pantalla: "screen",
  pantallas: "screen",
  screen: "screen",

  telefono: "phone",
  telefonos: "phone",
  smartphone: "phone",
  smartphones: "phone",
  phone: "phone",

  contenido: "content",
  content: "content",

  creador: "creator",
  creadora: "creator",
  creator: "creator",

  redes: "social",
  sociales: "social",
  social: "social",

  publicar: "publishing",
  publicacion: "publishing",
  publicaciones: "publishing",
  posting: "publishing",
  publishing: "publishing",

  comparativa: "comparison",
  comparacion: "comparison",
  comparar: "comparison",
  comparison: "comparison",

  diseno: "design",
  design: "design",

  frontal: "front",
  front: "front",

  trasera: "rear",
  posterior: "rear",
  rear: "rear",
  back: "rear",

  detalle: "closeup",
  closeup: "closeup",

  tienda: "store",
  store: "store",

  exhibicion: "display",
  display: "display",

  boton: "button",
  button: "button",

  interfaz: "interface",
  interface: "interface",

  profesional: "professional",
  professional: "professional",

  producto: "product",
  product: "product",

  compra: "purchase",
  comprar: "purchase",
  purchasing: "purchase",

  navegacion: "navigation",
  navigation: "navigation",
};

/*
  Estos conceptos pueden ayudar,
  pero son demasiado genéricos para
  pesar igual que "camera", "editing",
  "recording", etc.
*/
const GENERIC_VISUAL_TOKENS =
  new Set([
    "phone",
    "product",
    "content",
    "creator",
    "professional",
    "purchase",
    "video",
  ]);

const VARIANT_TOKENS =
  new Set([
    "pro",
    "max",
    "mini",
    "plus",
    "ultra",
  ]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(
    /\s+/g,
    ""
  );
}

function canonicalizeToken(
  token: string
) {
  return (
    SEMANTIC_ALIASES[token] ??
    token
  );
}

function tokenize(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean);
}

function tokenizeMeaningful(
  value: string
) {
  return [
    ...new Set(
      tokenize(value)
        .filter(
          (token) =>
            token.length >= 2 &&
            !STOP_WORDS.has(
              token
            )
        )
        .map(
          canonicalizeToken
        )
    ),
  ];
}

function includesNormalized(
  haystack: string,
  needle: string
) {
  const normalizedNeedle =
    normalize(needle);

  if (!normalizedNeedle) {
    return false;
  }

  return normalize(
    haystack
  ).includes(
    normalizedNeedle
  );
}

function includesCompact(
  haystack: string,
  needle: string
) {
  const compactNeedle =
    compact(needle);

  if (!compactNeedle) {
    return false;
  }

  return compact(
    haystack
  ).includes(
    compactNeedle
  );
}

/*
  Metadata destinada a comprobar
  identidad/modelo.

  No incluimos description ni suggestedUse,
  porque ahí puede haber palabras que no
  representan la identidad real del asset.
*/
function getAssetEntityText(
  asset: BrollAsset
) {
  return [
    asset.filename,
    asset.subcategory,
    asset.product,
    asset.model,
    asset.variant,
  ]
    .filter(Boolean)
    .join(" ");
}

/*
  Metadata destinada a entender
  QUÉ muestra visualmente el asset.
*/
function getAssetVisualText(
  asset: BrollAsset
) {
  return [
    asset.filename,
    asset.description,
    asset.suggestedUse,
    asset.shotType,
    ...asset.concepts,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCanonicalTokenSet(
  value: string
) {
  return new Set(
    tokenizeMeaningful(
      value
    )
  );
}

function getVisualTokenWeight(
  token: string
) {
  if (
    GENERIC_VISUAL_TOKENS.has(
      token
    )
  ) {
    return 3;
  }

  return 10;
}

export function matchBroll(
  catalog: BrollCatalog,
  request: BrollMatchRequest,
  limit = 5
): BrollMatch[] {
  const subject =
    request.subject?.trim() ?? "";

  const intent =
    request.intent?.trim() ?? "";

  const subjectTokens =
    tokenizeMeaningful(
      subject
    );

  const subjectTokenSet =
    new Set(
      subjectTokens
    );

  /*
    Lo que realmente queremos VER.

    Eliminamos tokens del subject para
    evitar contar "iPhone 15 Pro" dos veces.
  */
  const requestedVisualTokens =
    [
      ...new Set(
        [
          ...tokenizeMeaningful(
            intent
          ),

          ...request.concepts.flatMap(
            (concept) =>
              tokenizeMeaningful(
                concept
              )
          ),
        ].filter(
          (token) =>
            !subjectTokenSet.has(
              token
            )
        )
      ),
    ];

  const numericSubjectTokens =
    subjectTokens.filter(
      (token) =>
        /^\d+$/.test(
          token
        )
    );

  const variantSubjectTokens =
    subjectTokens.filter(
      (token) =>
        VARIANT_TOKENS.has(
          token
        )
    );

  /*
    Si existe intent o concepts,
    necesitamos relevancia visual real.

    El producto correcto por sí solo
    ya NO basta.
  */
  const hasVisualRequest =
    requestedVisualTokens.length >
      0 ||
    request.concepts.some(
      (concept) =>
        concept.trim().length >
        0
    );

  const matches =
    catalog.assets.map(
      (
        asset
      ): BrollMatch => {
        let score = 0;

        let entityScore = 0;
        let visualScore = 0;

        let visualMatches = 0;

        const reasons: string[] =
          [];

        const entityText =
          getAssetEntityText(
            asset
          );

        const visualText =
          getAssetVisualText(
            asset
          );

        const assetVisualTokens =
          getCanonicalTokenSet(
            visualText
          );

        /*
          ==========================
          1. IDENTIDAD
          ==========================

          Coincidir exactamente con el
          producto sigue siendo valioso.

          Pero bajamos su peso.
        */
        if (
          subject &&
          includesCompact(
            entityText,
            subject
          )
        ) {
          entityScore += 28;

          reasons.push(
            `exact subject: ${subject}`
          );
        }

        /*
          Subject parcial.
        */
        for (
          const token of
          subjectTokens
        ) {
          if (
            !includesCompact(
              entityText,
              token
            )
          ) {
            continue;
          }

          if (
            /^\d+$/.test(
              token
            )
          ) {
            entityScore += 10;
          } else if (
            VARIANT_TOKENS.has(
              token
            )
          ) {
            entityScore += 6;
          } else {
            entityScore += 4;
          }
        }

        /*
          ==========================
          2. MODELO EQUIVOCADO
          ==========================

          IMPORTANTE:

          Solo penalizamos cuando el asset
          DECLARA otro modelo.

          Un asset genérico con model=null
          puede funcionar como fallback.
        */
        if (
          asset.model &&
          numericSubjectTokens.length >
            0
        ) {
          const assetModel =
            normalize(
              asset.model
            );

          for (
            const requestedModel of
            numericSubjectTokens
          ) {
            if (
              !includesCompact(
                assetModel,
                requestedModel
              )
            ) {
              entityScore -= 50;

              reasons.push(
                `model mismatch: ${requestedModel}`
              );
            }
          }
        }

        /*
          Si el asset declara variante,
          también verificamos Pro/Max/etc.

          Si NO declara variante, no asumimos
          automáticamente que sea incorrecto.
        */
        if (
          asset.variant &&
          variantSubjectTokens.length >
            0
        ) {
          const assetVariant =
            normalize(
              asset.variant
            );

          for (
            const requestedVariant of
            variantSubjectTokens
          ) {
            if (
              !includesCompact(
                assetVariant,
                requestedVariant
              )
            ) {
              entityScore -= 15;
            }
          }
        }

        /*
          ==========================
          3. CONCEPTOS EXACTOS
          ==========================

          Una frase completa coincidente
          tiene bastante peso.
        */
        for (
          const concept of
          request.concepts
        ) {
          if (
            !concept.trim()
          ) {
            continue;
          }

          if (
            includesNormalized(
              visualText,
              concept
            )
          ) {
            visualScore += 18;

            visualMatches += 1;

            reasons.push(
              `concept: ${concept}`
            );
          }
        }

        /*
          ==========================
          4. MATCHING SEMÁNTICO SIMPLE
          ==========================

          Aquí están las señales visuales
          realmente importantes.
        */
        for (
          const token of
          requestedVisualTokens
        ) {
          if (
            !assetVisualTokens.has(
              token
            )
          ) {
            continue;
          }

          const weight =
            getVisualTokenWeight(
              token
            );

          visualScore +=
            weight;

          visualMatches += 1;

          reasons.push(
            `visual: ${token}`
          );
        }

        /*
          ==========================
          5. INTENT COMPLETO
          ==========================
        */
        if (
          intent &&
          includesNormalized(
            visualText,
            intent
          )
        ) {
          visualScore += 12;

          visualMatches += 1;

          reasons.push(
            "exact intent"
          );
        }

        /*
          ==========================
          6. SHOT TYPE
          ==========================
        */
        if (asset.shotType) {
          const shotTokens =
            tokenizeMeaningful(
              asset.shotType
            );

          if (
            shotTokens.some(
              (token) =>
                requestedVisualTokens.includes(
                  token
                )
            )
          ) {
            visualScore += 8;

            visualMatches += 1;

            reasons.push(
              `shot: ${asset.shotType}`
            );
          }
        }

        /*
          ==========================
          7. REGLA CLAVE
          ==========================

          Si Editorial Engine pidió algo
          visual específico y este asset
          NO coincide con nada visual:

          NO ES UN MATCH.

          Aunque sea exactamente
          el iPhone correcto.
        */
        if (
          hasVisualRequest &&
          visualMatches === 0
        ) {
          return {
            asset,
            score: -1000,
            reasons: [
              ...reasons,
              "no meaningful visual match",
            ],
          };
        }

        score += entityScore;
        score += visualScore;

        /*
          ==========================
          8. ORIENTACIÓN
          ==========================

          Bonus pequeño.
        */
        if (
          asset.orientation ===
          "vertical"
        ) {
          score += 4;

          reasons.push(
            "vertical"
          );
        }

        /*
          ==========================
          9. BIBLIOTECA PERSONAL
          ==========================
        */
        if (
          asset.source ===
          "personal"
        ) {
          score += 6;

          reasons.push(
            "personal library"
          );
        }

        /*
          ==========================
          10. REUTILIZACIÓN
          ==========================
        */
        if (
          asset.usageCount > 0
        ) {
          score -= Math.min(
            asset.usageCount *
              3,
            15
          );
        }

        /*
          Un asset sin entidad relacionada
          necesita una señal visual razonable
          para entrar como fallback semántico.
        */
        if (
          entityScore <= 0 &&
          visualScore < 10
        ) {
          score = -1000;
        }

        return {
          asset,
          score,
          reasons,
        };
      }
    );

  return matches
    .filter(
      (match) =>
        match.score > 0
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(0, limit);
}