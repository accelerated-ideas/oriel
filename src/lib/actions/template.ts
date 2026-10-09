// {{param}}, {{user.email}}, {{user.attributes.plan}}, {{conversation.id}} placeholders.
export type TemplateScope = {
  input: Record<string, unknown>;
  user: Record<string, unknown>;
  conversation: { id: string; page_url: string | null };
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function resolve(path: string, scope: TemplateScope): unknown {
  const parts = path.split(".");
  let current: unknown =
    parts[0] === "user" || parts[0] === "conversation" ? scope : (scope.input as Record<string, unknown>);
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function renderTemplate(template: string, scope: TemplateScope, encode: "url" | "json" | "raw") {
  return template.replace(PLACEHOLDER, (_, path: string) => {
    const value = resolve(path, scope);
    if (value === undefined || value === null) return "";
    const asString = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (encode === "url") return encodeURIComponent(asString);
    if (encode === "json") return JSON.stringify(asString).slice(1, -1);
    return asString;
  });
}

export function templatePlaceholders(template: string) {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}
