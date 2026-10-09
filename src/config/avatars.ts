// How the assistant is drawn in the widget, on the launcher and in the
// dashboard. Each one moves with the assistant's voice on a call.
export const AVATAR_STYLES = [
  { id: "orb", name: "Orb", description: "A glossy sphere" },
  { id: "face", name: "Face", description: "A friendly character" },
  { id: "hive", name: "Hive", description: "Dots that ripple with speech" },
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number]["id"];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = "orb";

export function isAvatarStyle(value: unknown): value is AvatarStyle {
  return AVATAR_STYLES.some((style) => style.id === value);
}
