// Rules for deciding whether the user is really taking a turn while the
// assistant is talking.

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// Sounds people make to show they're listening, not to take the turn.
const BACKCHANNEL = new Set([
  "mm", "mmm", "mhm", "mmhmm", "hmm", "uh", "um", "uhhuh", "huh", "ah", "oh",
  "yeah", "yep", "yes", "ok", "okay", "right", "sure", "alright", "cool", "nice", "great",
  "got", "it", "i", "see", "thanks", "thank", "you", "ja", "oui", "si", "sí",
]);

export function isBackchannel(text: string) {
  const list = words(text);
  return list.length > 0 && list.length <= 3 && list.every((word) => BACKCHANNEL.has(word.replace(/'/g, "")));
}

// Speech recognition picking up the assistant's own voice from the speakers.
// Echo repeats what was said word for word, so the transcript must line up
// with a stretch of the recent speech (one misheard word allowed in longer
// ones). "No, the team plan" after "...the Pro plan or the Team plan?" isn't echo.
export function isEcho(text: string, recentlySpoken: string) {
  const heard = words(text);
  if (heard.length === 0) return true;
  const spoken = words(recentlySpoken);
  const allowedMisses = heard.length >= 5 ? 1 : 0;
  for (let offset = 0; offset + heard.length <= spoken.length; offset++) {
    let misses = 0;
    for (let i = 0; i < heard.length && misses <= allowedMisses; i++) {
      if (heard[i] !== spoken[offset + i]) misses++;
    }
    if (misses <= allowedMisses) return true;
  }
  return false;
}

export function wordCount(text: string) {
  return words(text).length;
}
