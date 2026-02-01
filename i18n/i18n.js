const I18N_DIR = "./i18n";
const DEFAULT_LANG = "en";

let currentDictionary = {};
let currentLang = DEFAULT_LANG;

function parseProperties(text) {
  const dict = {};
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    dict[key] = value;
  }
  return dict;
}

async function loadProperties(lang) {
  const tryPaths = [`${I18N_DIR}/${lang}.properties`, `${I18N_DIR}/${DEFAULT_LANG}.properties`];

  for (const path of tryPaths) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      return parseProperties(text);
    } catch {
      // continue to fallback
    }
  }

  return {};
}

export function t(key) {
  return currentDictionary[key] ?? key;
}

export function getLang() {
  return currentLang;
}

export function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(currentDictionary, key);
}

export function applyI18nToDom() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr") || "";
    spec
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (!attr || !key) return;
        el.setAttribute(attr, t(key));
      });
  });

  document.documentElement.lang = currentLang;
}

export async function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("app.lang", lang);

  currentDictionary = await loadProperties(lang);
  applyI18nToDom();
}

export function initLanguage() {
  const saved = localStorage.getItem("app.lang");
  const initial = saved || DEFAULT_LANG;
  return setLanguage(initial);
}
