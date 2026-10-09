// The model points at things by wrapping their name in its reply:
// "Press [[Send]] in the top right." The name stays in the text (shown in
// chat, spoken on calls) without the brackets, and the page points at it as
// it goes by. Because the name is the marker, a sentence never loses it.
// The older silent form, "[[point: Send]]", still points but isn't shown.

const OPEN = "[[";
const CLOSE = "]]";
// A "[[" with no "]]" this far along wasn't a marker after all.
const MAX_MARKER_LENGTH = 80;
const SILENT = "point:";
// Text that can follow a dropped silent marker without a space before it.
const NO_SPACE_BEFORE = " \n\t.,!?;:…)";

export type MarkerPiece = { text: string } | { point: string };

export class InlineMarkers {
  private buffer = "";
  // Trailing whitespace is held back until we know whether a silent marker
  // follows, so "Press Connect [[point: Connect]]." comes out as "Press Connect."
  private heldSpace = false;

  push(delta: string): MarkerPiece[] {
    this.buffer += delta;
    const pieces: MarkerPiece[] = [];

    while (this.buffer) {
      const open = this.buffer.indexOf(OPEN);
      if (open === -1) {
        // Hold a trailing "[" in case it's the start of "[[".
        const keep = this.buffer.endsWith("[") ? 1 : 0;
        this.emitText(pieces, this.buffer.slice(0, this.buffer.length - keep));
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      }
      this.emitText(pieces, this.buffer.slice(0, open));
      this.buffer = this.buffer.slice(open);

      const close = this.buffer.indexOf(CLOSE);
      if (close === -1) {
        if (this.buffer.length <= MAX_MARKER_LENGTH) break;
        // Not a marker; let the brackets through as text.
        this.emitText(pieces, OPEN);
        this.buffer = this.buffer.slice(OPEN.length);
        continue;
      }

      const body = this.buffer.slice(OPEN.length, close).trim();
      this.buffer = this.buffer.slice(close + CLOSE.length);
      if (body.toLowerCase().startsWith(SILENT)) {
        const label = body.slice(SILENT.length).trim();
        if (label) pieces.push({ point: label });
        continue;
      }
      if (!body) continue;
      // Bold around or inside the name stays in the text, not in what's pointed at.
      const label = body.replaceAll("**", "").trim();
      if (label) pieces.push({ point: label });
      this.emitText(pieces, body);
    }
    return pieces;
  }

  // Whatever is left when the reply ends.
  end(): MarkerPiece[] {
    const rest = this.buffer;
    this.buffer = "";
    const pieces: MarkerPiece[] = [];
    // A marker cut off by the end of the reply is dropped; other text is kept.
    if (rest && !rest.trimStart().startsWith(OPEN)) this.emitText(pieces, rest);
    this.heldSpace = false;
    return pieces;
  }

  private emitText(pieces: MarkerPiece[], text: string) {
    if (!text) return;
    if (this.heldSpace && !NO_SPACE_BEFORE.includes(text[0])) text = ` ${text}`;
    this.heldSpace = false;
    const trimmed = text.trimEnd();
    if (trimmed.length < text.length) this.heldSpace = true;
    if (trimmed) pieces.push({ text: trimmed });
  }
}
