// Turns a stream of model tokens into pieces for text-to-speech. Every piece is
// voiced on its own (flushed), so pieces are whole sentences:
//   - The voice plans intonation from the text it's given, and starts speaking
//     once it has about 40 characters and 8 words. Given half a sentence it
//     would speak before knowing how the sentence ends, say in a question.
//   - The first sentence goes alone, so speaking starts quickly. Later ones are
//     held while it plays and voiced together: sentences voiced separately are
//     stitched back to back and sound like lines read out, not one person
//     talking (in listening tests the grouped version flowed best).
//   - A very long sentence goes a clause at a time, at a comma, semicolon,
//     colon or dash. So does a long first sentence that's still being
//     written: speaking can start at its first comma rather than wait for the
//     rest (the model sends text in bursts about a quarter second apart).
// Text the model is slow to finish is released by the caller after a pause
// (`release`), and whatever is left at the end of a block by `end`.

// Send held sentences once there's this much, without waiting for the rest.
const GROUP_CHARS = 220;
// Past this many words, a sentence goes a clause at a time...
const LONG_SENTENCE_WORDS = 30;
// ...or, with no clause boundary at all, at a word boundary.
const MAX_SENTENCE_WORDS = 50;
// An unfinished first sentence can start with its first clause once that
// clause is this long.
const FIRST_CLAUSE_WORDS = 8;

// A sentence end followed by whitespace, optionally after closing quotes/brackets.
const SENTENCE_END = /[.!?…](?:["'’”)\]]+)?\s+|\n+/g;
// The same at the very end of the text so far (the next token may not have
// arrived), except after a digit ("2." of "2.5") or an abbreviation.
const ENDS_SENTENCE = /(?:[^\d\s.]\.|[!?…])(?:["'’”)\]]+)?$/;
const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|approx|no)\.$/i;
// Where a long sentence can be split.
const CLAUSE_END = /[,;:—–](?:["'’”)\]]+)?\s+/g;

export type SpeechPiece = { text: string; flush: true };

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export class SpeechChunker {
  // The sentence still being written.
  private buffer = "";
  // Finished sentences not sent yet.
  private held = "";
  private sentFirst = false;

  push(delta: string): SpeechPiece[] {
    this.buffer += delta;

    // Finished sentences move to `held`. A sentence needs 2+ words, so "Dr. Smith"
    // or "Sure." on its own don't end a piece.
    let cut = -1;
    for (const match of this.buffer.matchAll(SENTENCE_END)) {
      const end = match.index + match[0].length;
      if (ABBREVIATION.test(this.buffer.slice(0, end).trimEnd())) continue;
      if (countWords(this.buffer.slice(0, end)) >= 2) cut = end;
    }
    const tail = this.buffer.trim();
    if (ENDS_SENTENCE.test(tail) && !ABBREVIATION.test(tail) && countWords(tail) >= 2) cut = this.buffer.length;
    if (cut !== -1) {
      this.held += this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
    }

    // A long sentence: what's before its last clause boundary goes now.
    let force = false;
    const words = countWords(this.buffer);
    const waitingToStart = !this.sentFirst && !this.held.trim();
    if (waitingToStart && words >= FIRST_CLAUSE_WORDS) {
      let clause = -1;
      for (const match of this.buffer.matchAll(CLAUSE_END)) {
        const end = match.index + match[0].length;
        if (countWords(this.buffer.slice(0, end)) >= FIRST_CLAUSE_WORDS) clause = end;
      }
      if (clause !== -1) {
        this.held += this.buffer.slice(0, clause);
        this.buffer = this.buffer.slice(clause);
        force = true;
      }
    }
    if (!force && words >= LONG_SENTENCE_WORDS) {
      let clause = -1;
      for (const match of this.buffer.matchAll(CLAUSE_END)) clause = match.index + match[0].length;
      if (clause !== -1 && countWords(this.buffer.slice(0, clause)) >= 4) {
        this.held += this.buffer.slice(0, clause);
        this.buffer = this.buffer.slice(clause);
        force = true;
      } else if (words >= MAX_SENTENCE_WORDS) {
        const match = /^([\s\S]*\s)(\S+)$/.exec(this.buffer);
        if (match) {
          this.held += match[1];
          this.buffer = match[2];
          force = true;
        }
      }
    }

    if (!this.held.trim()) return [];
    if (force || !this.sentFirst || this.held.length >= GROUP_CHARS) return [this.take()];
    return [];
  }

  // Whether finished sentences are waiting to be sent.
  holding() {
    return this.held.trim().length > 0;
  }

  // Sends the held sentences now (the model paused).
  release(): SpeechPiece | null {
    return this.holding() ? this.take() : null;
  }

  // Everything left at the end of a block. The next block starts quickly again.
  end(): SpeechPiece | null {
    this.held += this.buffer;
    this.buffer = "";
    const piece = this.holding() ? this.take() : null;
    this.sentFirst = false;
    return piece;
  }

  private take(): SpeechPiece {
    const text = this.held.replace(/\s+/g, " ").trimStart();
    this.held = "";
    this.sentFirst = true;
    // A trailing space keeps the next piece from fusing onto this one's last word.
    return { text: text.endsWith(" ") ? text : `${text} `, flush: true };
  }
}
