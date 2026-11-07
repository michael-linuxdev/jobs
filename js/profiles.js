/** Role-based search profiles (no personal names in UI). */
export const DISTANCE_STEPS = [
  { km: 10, label: "10 km" },
  { km: 25, label: "25 km" },
  { km: 50, label: "50 km" },
  { km: 100, label: "100 km" },
  { km: 200, label: "200 km" },
];

export const DEFAULT_LOCATION = "Pirna";

/** Map legacy localStorage / cache ids → current role ids. */
export const PROFILE_ID_ALIASES = {
  michael: "it_m365",
  wife_social: "social_media",
  wife_erzieher: "erzieher_hep",
};

export const PROFILES = {
  it_m365: {
    id: "it_m365",
    name: "IT / M365 / Security",
    short: "IT-Administrator",
    role: "IT-Administrator",
    summary:
      "Match auf IT-Admin, Microsoft 365, Entra ID, Intune, PowerShell, Azure und Security.",
    queries: [
      "IT-Administrator Microsoft 365",
      "Systemadministrator Entra ID Intune",
      "IT Security Administrator",
      "Cloud Administrator Azure",
      "IT-Consultant Microsoft",
    ],
    keywords: [
      "microsoft 365",
      "entra",
      "azure ad",
      "intune",
      "powershell",
      "active directory",
      "windows server",
      "hyper-v",
      "defender",
      "conditional access",
      "systemadministrator",
      "it-administrator",
      "sicherheit",
    ],
    defaultLocation: "Pirna",
  },
  social_media: {
    id: "social_media",
    name: "Social Media (Einstieg)",
    short: "Content · Community · Marketing",
    role: "Social Media Manager/-in (Einstieg)",
    summary:
      "Einstiegsstellen nach IHK-/HSB-Kurs: Content, Community, Monitoring, digitale Kommunikation.",
    queries: [
      "Social Media Manager",
      "Social Media Managerin Einstieg",
      "Online Marketing Social Media",
      "Content Manager Social Media",
      "Community Manager",
    ],
    keywords: [
      "social media",
      "community",
      "content",
      "instagram",
      "tiktok",
      "marketing",
      "online marketing",
      "redaktion",
      "kommunikation",
      "digital",
    ],
    defaultLocation: "Dresden",
  },
  erzieher_hep: {
    id: "erzieher_hep",
    name: "Erzieher / HEP",
    short: "Kita · Hort · Assistenz",
    role: "Erzieher/-in / Heilerziehungspflege",
    summary:
      "Alternativspur: Erzieher/-in und Heilerziehungspflege in Kita, Hort, Wohnen und Assistenz.",
    queries: [
      "Erzieherin",
      "Erzieher Kita",
      "Heilerziehungspflegerin",
      "Heilerziehungspflege",
      "Sozialpädagogische Assistenz",
    ],
    keywords: [
      "erzieher",
      "kita",
      "hort",
      "heilerziehung",
      "hep",
      "sozialpädagog",
      "assistenz",
      "wohngruppe",
      "inklusion",
    ],
    defaultLocation: "Dresden",
  },
};

export function resolveProfileId(id) {
  if (!id) return "it_m365";
  if (PROFILES[id]) return id;
  const mapped = PROFILE_ID_ALIASES[id];
  if (mapped && PROFILES[mapped]) return mapped;
  return "it_m365";
}
