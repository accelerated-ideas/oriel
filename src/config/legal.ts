// Who runs the hosted service, for the terms and privacy pages. Have the pages
// reviewed before launch.
export const LEGAL = {
  // The company behind Oriel, from the Estonian business register.
  company: "Accelerated Ideas OÜ",
  registryCode: "17113323",
  address: "Ruunaoja tn 3, Lasnamäe linnaosa, 11415 Tallinn, Harju maakond, Estonia",
  country: "Estonia",
  // Whose law governs the terms, and where disputes are heard.
  governingLaw: "Estonia",
  courts: "Harju County Court in Tallinn, Estonia",
  // Where people can complain about how we handle personal data (the GDPR's lead authority for an Estonian company).
  dataProtectionAuthority: "the Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon)",
  email: "hello@useoriel.com",
  // When the terms and privacy pages last changed.
  updated: "October 8, 2026",
} as const;
