export const DEFAULT_SETTINGS = {
  enabled: true,
  language: "auto",
  languageChosen: false
};

export function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const explicit = source.languageChosen === true && (source.language === "ko" || source.language === "en");
  return {
    enabled: source.enabled !== false,
    language: explicit ? source.language : "auto",
    languageChosen: explicit
  };
}

// The value exactly as stored, for the start-up log; null when nothing is stored.
export async function readStoredSettings(storageArea) {
  if (!storageArea || typeof storageArea.get !== "function") return null;
  const stored = await storageArea.get("settings");
  return stored && stored.settings !== undefined ? stored.settings : null;
}

export async function loadSettings(storageArea) {
  return normalizeSettings(await readStoredSettings(storageArea));
}

export async function saveSettings(storageArea, settings) {
  const normalized = normalizeSettings(settings);
  await storageArea.set({ settings: normalized });
  return normalized;
}
