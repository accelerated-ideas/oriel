// The landing page's questions, shared by the FAQ section and the page's
// structured data (a server component can't read them from the client FAQ).

export type Question = { q: string; a: string };

export const LANDING_QUESTIONS: Question[] = [
  {
    q: "Does it only work by voice?",
    a: "No. Conversations start as a call, and people can switch to typing whenever they like. It's the same assistant either way, with the same knowledge and actions.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes. The app is open source: run it on your own servers with your own model and voice keys, with every feature and no message limits. The hosted plans are for teams who'd rather not run it themselves.",
  },
  {
    q: "What counts as a message?",
    a: "Each message a visitor sends, whether they say it or type it. The assistant's replies, the greeting, the goodbye that ends a conversation, and anything the assistant does in the background don't count.",
  },
  {
    q: "Which languages does it speak?",
    a: "Each assistant has a main language: English, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Swedish or Japanese. If a visitor writes in another language, it replies in theirs. Calls work best in the main language.",
  },
  {
    q: "Will it work on my site?",
    a: "If you can add a script tag, yes. It runs in its own frame, so it won't clash with your styles. Single-page apps can hand it their router, so it moves between pages without a reload.",
  },
  {
    q: "Can it really change things in my product?",
    a: "Only what you allow. Switch on Stripe operations, describe your own endpoints, or register functions from your app. You choose which actions need a confirmation, and anything account-specific only works for signed-in users.",
  },
  {
    q: "What happens when it can't help?",
    a: "It says so instead of guessing, then asks your team to follow up, by email or webhook with a summary. Every follow-up request also shows up in Insights.",
  },
  {
    q: "What powers the voice and the answers?",
    a: "Google's Gemini listens, with ElevenLabs as a backup, and ElevenLabs speaks. The answers come from Anthropic's Claude unless you pick Gemini or GPT for an assistant, with a backup model ready if the first one fails. Either way, they're grounded in the knowledge you give it.",
  },
];
