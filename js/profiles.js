/** Profile definitions derived from Lebenslauf Michael + Social-Media-Kurs (Wife). */
export const DISTANCE_STEPS = [
  { km: 10, label: "10 km" },
  { km: 25, label: "25 km" },
  { km: 50, label: "50 km" },
  { km: 100, label: "100 km" },
  { km: 200, label: "200 km" },
];

export const DEFAULT_LOCATION = "Pirna";

export const PROFILES = {
  michael: {
    id: "michael",
    name: "Michael",
    short: "IT · M365 · Security",
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
  wife_social: {
    id: "wife_social",
    name: "Partnerin · Social Media",
    short: "Social Media (Einstieg)",
    role: "Social Media Managerin (Einstieg)",
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
  wife_erzieher: {
    id: "wife_erzieher",
    name: "Partnerin · Erziehung",
    short: "Erzieher / HEP",
    role: "Erzieherin / Heilerziehungspflegerin",
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
