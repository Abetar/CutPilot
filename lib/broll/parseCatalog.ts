import Papa from "papaparse";

import {
  BrollAsset,
  BrollCatalog,
  BrollOrientation,
  BrollSourceType,
} from "@/lib/broll/types";

type CatalogRow = {
  Categoria?: string;
  Subcategoria?: string;
  Archivo?: string;
  Descripcion?: string;
  Fuente?: string;
  URL?: string;
  Licencia?: string;
  Duracion?: string;
  Resolucion?: string;
  Vertical_Horizontal?: string;
  Uso_sugerido?: string;
};

function clean(value?: string) {
  const result = value?.trim();

  return result ? result : null;
}

function normalizeOrientation(
  value?: string
): BrollOrientation {
  switch (value?.trim().toLowerCase()) {
    case "vertical":
      return "vertical";

    case "horizontal":
      return "horizontal";

    case "square":
    case "cuadrado":
      return "square";

    default:
      return "unknown";
  }
}

function normalizeSource(
  value?: string
): BrollSourceType {
  const source =
    value?.trim().toLowerCase() ?? "";

  if (source.includes("pexels")) {
    return "pexels";
  }

  if (source.includes("wikimedia")) {
    return "wikimedia";
  }

  if (source.includes("official")) {
    return "official";
  }

  if (source.includes("youtube")) {
    return "youtube-reference";
  }

  if (
    source === "personal" ||
    source === "propio"
  ) {
    return "personal";
  }

  return "other";
}

function getDirectory(path: string) {
  const normalized =
    path.replaceAll("\\", "/");

  const parts = normalized.split("/");

  parts.pop();

  return parts.join("/");
}

function getFilename(path: string) {
  const normalized =
    path.replaceAll("\\", "/");

  return (
    normalized.split("/").pop() ??
    normalized
  );
}

function createId(path: string) {
  return path
    .toLowerCase()
    .replaceAll("\\", "/")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/*
  Intenta extraer información como:

  "iPhone 15"
       ↓
  product: "iPhone"
  model: "15"

  No contiene una lista fija de modelos.
*/
function deriveProductAndModel(
  subcategory: string | null,
  category: string | null
) {
  if (!subcategory) {
    return {
      product:
        category === "Tech"
          ? null
          : category,
      model: null,
    };
  }

  const match =
    subcategory.match(
      /^(.+?)\s+(\d+(?:\.\d+)?)$/i
    );

  if (match) {
    return {
      product: match[1].trim(),
      model: match[2].trim(),
    };
  }

  return {
    product: subcategory,
    model: null,
  };
}

/*
  Variante derivada del filename.

  No hardcodeamos generaciones de iPhone.
  Solo variantes de producto comunes.
*/
function deriveVariant(
  filename: string
) {
  const normalized =
    filename.toLowerCase();

  if (
    normalized.includes("_pro_max_")
  ) {
    return "Pro Max";
  }

  if (normalized.includes("_pro_")) {
    return "Pro";
  }

  if (normalized.includes("_plus_")) {
    return "Plus";
  }

  if (normalized.includes("_mini_")) {
    return "Mini";
  }

  return null;
}

function deriveShotType(
  filename: string,
  description: string | null
) {
  const text = [
    filename,
    description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const rules: Array<
    [string[], string]
  > = [
    [["closeup", "primer plano"], "closeup"],
    [["cenital"], "top-down"],
    [["unboxing"], "unboxing"],
    [["comparativa"], "comparison"],
    [["exhibicion", "exhibición"], "display"],
    [["trasera"], "rear"],
    [["frontal"], "front"],
    [["pantalla"], "screen"],
    [["teclado"], "keyboard"],
  ];

  for (const [keywords, shotType] of rules) {
    if (
      keywords.some((keyword) =>
        text.includes(keyword)
      )
    ) {
      return shotType;
    }
  }

  return null;
}

function deriveConcepts(
  filename: string,
  description: string | null,
  suggestedUse: string | null
) {
  const source = [
    filename
      .replace(/\.[^.]+$/, "")
      .replaceAll("_", " "),
    description ?? "",
    suggestedUse ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const stopWords = new Set([
    "de",
    "del",
    "la",
    "el",
    "en",
    "con",
    "y",
    "para",
    "un",
    "una",
    "por",
    "los",
    "las",
    "que",
    "real",
    "foto",
    "animada",
    "movimiento",
    "añadido",
    "mp4",
    "01",
    "02",
    "03",
    "04",
    "05",
  ]);

  const concepts = source
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3 &&
        !stopWords.has(word)
    );

  return [...new Set(concepts)];
}

function parseDuration(
  value?: string
) {
  if (!value?.trim()) {
    return null;
  }

  const parsed =
    Number.parseFloat(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function parseBrollCatalog(
  csv: string
): BrollCatalog {
  const result =
    Papa.parse<CatalogRow>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) =>
        header.trim(),
    });

  if (result.errors.length > 0) {
    const criticalErrors =
      result.errors.filter(
        (error) =>
          error.type !== "FieldMismatch"
      );

    if (criticalErrors.length > 0) {
      throw new Error(
        `No se pudo leer catalogo_broll.csv: ${criticalErrors[0].message}`
      );
    }
  }

  const assets: BrollAsset[] = [];

  for (const row of result.data) {
    const path = clean(
      row.Archivo
    );

    /*
      Una fila sin archivo no puede convertirse
      en un asset utilizable.
    */
    if (!path) {
      continue;
    }

    /*
      Protección extra para evitar que /work
      termine entrando al índice accidentalmente.
    */
    const normalizedPath =
      path.replaceAll("\\", "/");

    if (
      normalizedPath === "work" ||
      normalizedPath.startsWith(
        "work/"
      ) ||
      normalizedPath.includes(
        "/work/"
      )
    ) {
      continue;
    }

    const category =
      clean(row.Categoria);

    const subcategory =
      clean(row.Subcategoria);

    const description =
      clean(row.Descripcion);

    const suggestedUse =
      clean(row.Uso_sugerido);

    const filename =
      getFilename(path);

    const {
      product,
      model,
    } = deriveProductAndModel(
      subcategory,
      category
    );

    assets.push({
      id: createId(path),

      path: normalizedPath,

      filename,

      directory:
        getDirectory(path),

      category,

      subcategory,

      description,

      suggestedUse,

      product,

      model,

      variant:
        deriveVariant(filename),

      concepts:
        deriveConcepts(
          filename,
          description,
          suggestedUse
        ),

      shotType:
        deriveShotType(
          filename,
          description
        ),

      orientation:
        normalizeOrientation(
          row.Vertical_Horizontal
        ),

      duration:
        parseDuration(
          row.Duracion
        ),

      resolution:
        clean(row.Resolucion),

      source:
        normalizeSource(
          row.Fuente
        ),

      sourceName:
        clean(row.Fuente),

      sourceUrl:
        clean(row.URL),

      license:
        clean(row.Licencia),

      /*
        Tu CSV actual no tiene una columna
        de crédito separada.

        No inventamos créditos.
      */
      credits: null,

      usageCount: 0,

      lastUsed: null,

      /*
        Los embeddings llegan después.
      */
      embedding: null,
    });
  }

  return {
    assets,

    indexedAt:
      new Date().toISOString(),

    totalAssets:
      assets.length,
  };
}