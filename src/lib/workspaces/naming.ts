// A sensible first name for someone's workspace: their company, from a work
// email ("ana@acme.com" → "Acme"), or "Ana's workspace" for personal email.
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "gmx.de",
  "web.de",
  "mail.com",
  "yandex.ru",
  "hey.com",
  "fastmail.com",
]);

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function defaultWorkspaceName(email: string | null | undefined) {
  const [local = "", domain = ""] = (email ?? "").toLowerCase().split("@");
  if (domain && !PERSONAL_DOMAINS.has(domain)) {
    const labels = domain.split(".");
    // acme.com → acme, acme.co.uk → acme
    const secondLevel = labels.length >= 3 && labels.at(-1)!.length === 2 && /^(co|com|org|net|ac|gov|edu)$/.test(labels.at(-2)!);
    const company = labels.at(secondLevel ? -3 : -2);
    if (company && company.length > 1) return company.split("-").map(capitalize).join(" ");
  }
  const first = local.split(/[._+-]/)[0];
  return first ? `${capitalize(first)}'s workspace` : "My workspace";
}
