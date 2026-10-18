export const DEFAULT_SETTINGS = {
  enabled: true,
  language: "auto"
};

export function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const language = source.language === "ko" || source.language === "en" ? source.language : "auto";
  return {
    enabled: source.enabled !== false,
    language
  };
}

export async function loadSettings(storageArea) {
  if (!storageArea || typeof storageArea.get !== "function") return { ...DEFAULT_SETTINGS };
  const stored = await storageArea.get("settings");
  return normalizeSettings(stored && stored.settings);
}

export async function saveSettings(storageArea, settings) {
  const normalized = normalizeSettings(settings);
  await storageArea.set({ settings: normalized });
  return normalized;
}
