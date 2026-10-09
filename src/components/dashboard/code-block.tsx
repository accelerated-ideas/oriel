"use client";
import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { parse, render, type ParseOptions } from "sugar-high/core";
import * as html from "sugar-high/lang/html";
import * as typescript from "sugar-high/lang/typescript";
import { cn } from "@/lib/utils";

export function CopyButton({ value, className, label = "Copy" }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium transition-colors [&_svg]:size-3.5",
        className,
      )}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  );
}

// The language modules are what sugar-high's README passes to parse(); their
// option types are just declared more loosely than ParseOptions.
const GRAMMARS = { html, typescript } as unknown as Record<"html" | "typescript", ParseOptions>;
type Syntax = keyof typeof GRAMMARS;

// Token colors for the dark block, solid so overlapping glyphs stay clean.
const THEME = {
  "--sh-comment": "#8b8b94",
  "--sh-keyword": "#7dd3fc",
  "--sh-string": "#c4b5fd",
  "--sh-entity": "#f9a8d4",
  "--sh-property": "#fcd34d",
  "--sh-class": "#fdba74",
  "--sh-identifier": "#e4e4e7",
  "--sh-jsxliterals": "#e4e4e7",
  "--sh-sign": "#a1a1aa",
} as React.CSSProperties;

// A snippet with syntax highlighting (sugar-high: small, and synchronous, so
// it's colored from the first render) and a copy button. `language` is the
// label in the header (a file name reads best); `syntax` picks the grammar:
// TypeScript, which covers plain JavaScript too, unless it's HTML. Long lines
// wrap, so nothing hides past the edge.
export function CodeBlock({
  code,
  language,
  syntax = language?.endsWith("html") ? "html" : "typescript",
  className,
}: {
  code: string;
  language?: string;
  syntax?: Syntax;
  className?: string;
}) {
  // sugar-high escapes the code, so the markup is safe to insert.
  const highlighted = useMemo(() => render(parse(code, GRAMMARS[syntax])), [code, syntax]);

  return (
    <div className={cn("overflow-hidden rounded-xl bg-ink", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11.5px] text-[#a1a1aa]">{language}</span>
        <CopyButton value={code} className="text-[#d4d4d8] hover:bg-white/10 hover:text-white" />
      </div>
      <pre
        style={THEME}
        className="p-4 font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-[#e4e4e7]"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
