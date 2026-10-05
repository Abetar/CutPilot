"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useState,
} from "react";

import {
  LocalBrollLibrary,
  openLocalBrollLibrary,
} from "@/lib/broll/localLibrary";

type BrollLibraryContextType = {
  library: LocalBrollLibrary | null;

  isConnecting: boolean;

  error: string | null;

  connectLibrary: () => Promise<void>;

  disconnectLibrary: () => void;
};

const BrollLibraryContext =
  createContext<BrollLibraryContextType | null>(
    null
  );

export function BrollLibraryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [library, setLibrary] =
    useState<LocalBrollLibrary | null>(null);

  const [isConnecting, setIsConnecting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function connectLibrary() {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const result =
        await openLocalBrollLibrary();

      setLibrary(result);

      console.log(
        "CutPilot B-roll library connected:",
        {
          folder:
            result.rootHandle.name,

          assets:
            result.catalog.totalAssets,
        }
      );
    } catch (error) {
      /*
        Si el usuario simplemente cierra
        el selector de carpeta, no necesitamos
        tratarlo como un fallo grave.
      */
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      console.error(
        "CutPilot B-roll library error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "No se pudo conectar la biblioteca de B-roll."
      );
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnectLibrary() {
    setLibrary(null);
    setError(null);
  }

  return (
    <BrollLibraryContext.Provider
      value={{
        library,
        isConnecting,
        error,
        connectLibrary,
        disconnectLibrary,
      }}
    >
      {children}
    </BrollLibraryContext.Provider>
  );
}

export function useBrollLibrary() {
  const context =
    useContext(BrollLibraryContext);

  if (!context) {
    throw new Error(
      "useBrollLibrary must be used inside BrollLibraryProvider"
    );
  }

  return context;
}