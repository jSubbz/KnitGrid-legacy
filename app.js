/**
 * i18n + UI template wiring
 * - Loads /i18n/<lang>.properties
 * - Applies keys to text + attributes
 * - Stores chosen language in localStorage
 */

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

    // Split only on the first "=" (properties files often allow "=" in values)
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    dict[key] = value;
  }
  return dict;
}

async function loadProperties(lang) {
  // Try requested lang, fall back to DEFAULT_LANG if missing
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

  // If fetch fails entirely (e.g., opened via file://), return empty dict
  return {};
}

function t(key) {
  return currentDictionary[key] ?? key;
}

function applyI18nToDom() {
  // Text nodes via data-i18n
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  // Attributes via data-i18n-attr, format: "attr:key;attr2:key2"
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

  // Keep <html lang="..."> in sync
  document.documentElement.lang = currentLang;
}

function setStatus(key) {
  const statusRight = document.getElementById("statusRight");
  statusRight.textContent = t(key);
}

async function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("app.lang", lang);

  currentDictionary = await loadProperties(lang);
  applyI18nToDom();
  setStatus("status.lang.changed");
}

function initWindowControls() {
  document.getElementById("btnMin").addEventListener("click", () => {
    setStatus("status.window.minimize.clicked");
  });

  document.getElementById("btnMax").addEventListener("click", () => {
    document.querySelector(".window").classList.toggle("is-max");
    setStatus("status.window.maximize.toggled");
  });

  document.getElementById("btnClose").addEventListener("click", () => {
    setStatus("status.window.close.clicked");
    // In Electron/Tauri/etc, this is where you'd actually close the window.
  });

  // Optional: maximize visual tweak
  const style = document.createElement("style");
  style.textContent = `.window.is-max { border-color: transparent; }`;
  document.head.appendChild(style);
}

function initLanguageSelect() {
  const select = document.getElementById("langSelect");
  const saved = localStorage.getItem("app.lang");
  const initial = saved || DEFAULT_LANG;

  select.value = initial;
  select.addEventListener("change", (e) => {
    setLanguage(e.target.value);
  });

  // Load initial language
  setLanguage(initial);
}

// Boot
initWindowControls();
initLanguageSelect();
