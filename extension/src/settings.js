export const DEFAULT_SETTINGS = {
  enabled: true,
  language: "en",
  languageChosen: false
};

export function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  // Only a language picked in this version's popup counts; a "ko" saved by an older build without the marker is ignored.
  const languageChosen = source.languageChosen === true;
  const language = languageChosen && source.language === "ko" ? "ko" : "en";
  return {
    enabled: source.enabled !== false,
    language,
    languageChosen
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
