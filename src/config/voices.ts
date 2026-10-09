// ElevenLabs voices, with a short preview clip of each in public/voice-previews.
// Elise, Archer, Josh, Mark and Lauren's clips were generated with Eleven v4
// Turbo (the model calls use) from one line: "Hi! I can answer your questions,
// show you around, or take you straight to the right page. What are you
// looking for today?"

export const VOICE_OPTIONS = [
  { id: "EST9Ui6982FZPSi7gCHi", name: "Elise", description: "Upbeat and lively", previewUrl: "/voice-previews/elise.mp3" },
  { id: "r1KmysJdVYZjJCm4mL3b", name: "Jessica", description: "Warm and bright", previewUrl: "/voice-previews/jessica.mp3" },
  { id: "7QN34D2r3hCNwbOYIeK0", name: "Will", description: "Relaxed and friendly", previewUrl: "/voice-previews/will.mp3" },
  { id: "8dEUmyPMdDdK91vboYih", name: "Brian", description: "Deep and steady", previewUrl: "/voice-previews/brian.mp3" },
  { id: "22N9cF8z0o7y23njdyaY", name: "Lily", description: "Soft, British", previewUrl: "/voice-previews/lily.mp3" },
  { id: "BFd5oBc2DDna33pSi4Gf", name: "Alice", description: "Clear and confident", previewUrl: "/voice-previews/alice.mp3" },
  { id: "6WwXjDDEMyNmFG95zycZ", name: "George", description: "Calm, British", previewUrl: "/voice-previews/george.mp3" },
  { id: "OZ0L6eISlOejga3XjDFt", name: "Sarah", description: "Reassuring", previewUrl: "/voice-previews/sarah.mp3" },
  { id: "Fahco4VZzobUeiPqni1S", name: "Archer", description: "Articulate, British", previewUrl: "/voice-previews/archer.mp3" },
  { id: "ZoiZ8fuDWInAcwPXaVeq", name: "Josh", description: "Easygoing and grounded", previewUrl: "/voice-previews/josh.mp3" },
  { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", description: "Rich and resonant", previewUrl: "/voice-previews/mark.mp3" },
  { id: "DODLEQrClDo8wCz460ld", name: "Lauren", description: "Gentle and unhurried", previewUrl: "/voice-previews/lauren.mp3" },
] as const;

// New assistants start with Elise; existing ones keep their voice.
export const DEFAULT_VOICE_ID = "EST9Ui6982FZPSi7gCHi";

export function voiceName(voiceId: string) {
  return VOICE_OPTIONS.find((voice) => voice.id === voiceId)?.name ?? "Custom voice";
}

// A language isn't a country, so each flag is just a visual cue: the country
// with the most speakers, or where the language comes from. `locale` is the
// BCP-47 hint Gemini transcription takes.
export const LANGUAGE_OPTIONS = [
  { code: "en", name: "English", flag: "🇺🇸", locale: "en-US" },
  { code: "de", name: "German", flag: "🇩🇪", locale: "de-DE" },
  { code: "fr", name: "French", flag: "🇫🇷", locale: "fr-FR" },
  { code: "es", name: "Spanish", flag: "🇪🇸", locale: "es-ES" },
  { code: "it", name: "Italian", flag: "🇮🇹", locale: "it-IT" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", locale: "pt-BR" },
  { code: "nl", name: "Dutch", flag: "🇳🇱", locale: "nl-NL" },
  { code: "pl", name: "Polish", flag: "🇵🇱", locale: "pl-PL" },
  { code: "sv", name: "Swedish", flag: "🇸🇪", locale: "sv-SE" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", locale: "ja-JP" },
] as const;

export function languageName(code: string) {
  return LANGUAGE_OPTIONS.find((language) => language.code === code)?.name ?? code;
}
