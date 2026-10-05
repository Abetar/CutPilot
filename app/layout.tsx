import type { Metadata } from "next";
import "./globals.css";

import { VideoSessionProvider } from "@/components/VideoSessionProvider";
import { BrollLibraryProvider } from "@/components/BrollLibraryProvider";

export const metadata: Metadata = {
  title: "CutPilot",
  description: "Personal short-form video editor and publisher",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <BrollLibraryProvider>
          <VideoSessionProvider>
            {children}
          </VideoSessionProvider>
        </BrollLibraryProvider>
      </body>
    </html>
  );
}