export type BrollOrientation =
  | "vertical"
  | "horizontal"
  | "square"
  | "unknown";

export type BrollSourceType =
  | "personal"
  | "pexels"
  | "wikimedia"
  | "official"
  | "youtube-reference"
  | "other";

export type BrollAsset = {
  /*
    Identificador interno estable.
  */
  id: string;

  /*
    Ruta relativa dentro de la biblioteca.

    Ejemplo:
    Tech/iPhone 16/iphone16_usbc_closeup_foto_animada_03.mp4
  */
  path: string;

  filename: string;

  directory: string;

  /*
    Metadata proveniente directamente
    del catálogo.
  */
  category: string | null;

  subcategory: string | null;

  description: string | null;

  suggestedUse: string | null;

  /*
    Metadata semántica normalizada.

    Parte podrá derivarse del catálogo,
    filename y directorio.
  */
  product: string | null;

  model: string | null;

  variant: string | null;

  concepts: string[];

  shotType: string | null;

  /*
    Metadata técnica.
  */
  orientation: BrollOrientation;

  duration: number | null;

  resolution: string | null;

  /*
    Procedencia y licencia.
  */
  source: BrollSourceType;

  sourceName: string | null;

  sourceUrl: string | null;

  license: string | null;

  credits: string | null;

  /*
    Datos para evitar reutilización
    excesiva de los mismos clips.
  */
  usageCount: number;

  lastUsed: string | null;

  /*
    Preparado para semantic search.

    Todavía no generamos embeddings.
  */
  embedding: number[] | null;
};

export type BrollCatalog = {
  assets: BrollAsset[];

  indexedAt: string | null;

  totalAssets: number;
};