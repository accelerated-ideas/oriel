// Who runs the hosted service, for the terms and privacy pages. Have the pages
// reviewed before launch.
export const LEGAL = {
  // The company behind Oriel, from the Estonian business register.
  company: "Accelerated Ideas OÜ",
  registryCode: "17113323",
  address: "Ruunaoja tn 3, Lasnamäe linnaosa, 11415 Tallinn, Harju maakond, Estonia",
  // The same address in parts, for the site's structured data.
  postal: { street: "Ruunaoja tn 3", locality: "Tallinn", region: "Harju maakond", postalCode: "11415", countryCode: "EE" },
  country: "Estonia",
  // Whose law governs the terms, and where disputes are heard.
  governingLaw: "Estonia",
  courts: "Harju County Court in Tallinn, Estonia",
  // Where people can complain about how we handle personal data (the GDPR's lead authority for an Estonian company).
  dataProtectionAuthority: "the Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon)",
  email: "hello@useoriel.com",
  // When the terms and privacy pages last changed.
  updated: "October 9, 2026",
} as const;

// The same day as a date, for the sitemap and structured data. Read as UTC:
// otherwise east of Greenwich it's the evening before.
export const LEGAL_UPDATED_AT = new Date(`${LEGAL.updated} UTC`);
