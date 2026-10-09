"use client";
import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

// When the root layout itself fails: its own document, without the layout's fonts.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink antialiased">
        <title>Something went wrong</title>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
