import { parseBrollCatalog } from "@/lib/broll/parseCatalog";
import type { BrollCatalog } from "@/lib/broll/types";

export type LocalBrollLibrary = {
  rootHandle: FileSystemDirectoryHandle;
  catalogFile: File;
  catalog: BrollCatalog;
};

/*
  TypeScript todavía no expone showDirectoryPicker()
  de forma consistente en todas las configuraciones,
  así que declaramos únicamente lo que necesitamos.
*/
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function supportsLocalBrollLibrary() {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function"
  );
}

/*
  Abre la carpeta raíz de B-roll.

  Ejemplo esperado:

  Broll/
  ├── catalogo_broll.csv
  ├── Tech/
  ├── Arquitectura/
  ├── Codigo/
  ├── Farmacia/
  └── ...
*/
export async function openLocalBrollLibrary(): Promise<LocalBrollLibrary> {
  if (typeof window === "undefined") {
    throw new Error(
      "La biblioteca local solo puede abrirse desde el navegador."
    );
  }

  if (!window.showDirectoryPicker) {
    throw new Error(
      "Este navegador no soporta acceso directo a carpetas locales."
    );
  }

  /*
    El usuario elige explícitamente su carpeta Broll.
    CutPilot recibe únicamente permiso de lectura.
  */
  const rootHandle =
    await window.showDirectoryPicker({
      mode: "read",
    });

  let catalogHandle: FileSystemFileHandle;

  try {
    catalogHandle =
      await rootHandle.getFileHandle(
        "catalogo_broll.csv"
      );
  } catch {
    throw new Error(
      "No encontré catalogo_broll.csv en la raíz de la carpeta seleccionada."
    );
  }

  const catalogFile =
    await catalogHandle.getFile();

  const csv =
    await catalogFile.text();

  const catalog =
    parseBrollCatalog(csv);

  if (catalog.totalAssets === 0) {
    throw new Error(
      "catalogo_broll.csv no contiene recursos utilizables."
    );
  }

  return {
    rootHandle,
    catalogFile,
    catalog,
  };
}

/*
  Convierte una ruta del CSV:

  Tech/iPhone 16/iphone16_usbc_closeup_foto_animada_03.mp4

  en el File real de Windows, sin necesitar
  conocer C:\\Users\\... ni guardar rutas absolutas.
*/
export async function getBrollFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<File> {
  const normalizedPath =
    relativePath
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");

  const parts =
    normalizedPath
      .split("/")
      .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(
      "La ruta del recurso está vacía."
    );
  }

  /*
    Seguridad básica: el catálogo nunca debe
    poder escapar de la carpeta Broll elegida.
  */
  if (
    parts.some(
      (part) =>
        part === ".." ||
        part === "."
    )
  ) {
    throw new Error(
      `Ruta inválida: ${relativePath}`
    );
  }

  const filename =
    parts.pop();

  if (!filename) {
    throw new Error(
      `No se pudo determinar el archivo: ${relativePath}`
    );
  }

  let currentDirectory =
    rootHandle;

  /*
    Navegamos por cada subcarpeta indicada
    en catalogo_broll.csv.
  */
  for (const directory of parts) {
    try {
      currentDirectory =
        await currentDirectory.getDirectoryHandle(
          directory
        );
    } catch {
      throw new Error(
        `No existe la carpeta "${directory}" para el recurso "${relativePath}".`
      );
    }
  }

  let fileHandle: FileSystemFileHandle;

  try {
    fileHandle =
      await currentDirectory.getFileHandle(
        filename
      );
  } catch {
    throw new Error(
      `No encontré el archivo "${relativePath}" en tu biblioteca.`
    );
  }

  return fileHandle.getFile();
}

/*
  Más adelante usaremos esto para crear
  previews de los candidatos sin subir
  el B-roll a ninguna nube.
*/
export function createBrollPreviewUrl(
  file: File
) {
  return URL.createObjectURL(file);
}

export function revokeBrollPreviewUrl(
  url: string
) {
  URL.revokeObjectURL(url);
}