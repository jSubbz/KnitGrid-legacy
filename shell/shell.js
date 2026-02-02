import { UI } from "./uiBus.js";
import { setLanguage, getLang, hasKey, t } from "../i18n/i18n.js";

function closeAllMenus() {
  document.querySelectorAll(".menu-popup").forEach((popup) => {
    popup.hidden = true;
  });
  document.querySelectorAll(".menu-trigger").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function updateLanguageMenuChecks() {
  const currentLang = getLang();
  document.querySelectorAll('[data-menu="language"] .menu-popup-item').forEach((btn) => {
    const lang = btn.getAttribute("data-lang");
    btn.setAttribute("aria-checked", lang === currentLang ? "true" : "false");
  });
}

function initStatusBar() {
  const leftEl = document.getElementById("statusLeft");
  const rightEl = document.getElementById("statusRight");
  let rightClearTimer = null;

  UI.on("status:left", ({ keyOrText }) => {
    leftEl.textContent = hasKey(keyOrText) ? t(keyOrText) : keyOrText;
  });

  UI.on("status:right", ({ keyOrText, options }) => {
    if (rightClearTimer) {
      clearTimeout(rightClearTimer);
      rightClearTimer = null;
    }

    rightEl.textContent = hasKey(keyOrText) ? t(keyOrText) : keyOrText;

    const ttlMs = typeof options.ttlMs === "number" ? options.ttlMs : 2500;
    if (ttlMs > 0) {
      rightClearTimer = setTimeout(() => {
        rightEl.textContent = "";
        rightClearTimer = null;
      }, ttlMs);
    }
  });
}

function initWindowControls() {
  document.getElementById("btnMin").addEventListener("click", () => {
    UI.statusRight("status.window.minimize.clicked");
  });

  document.getElementById("btnMax").addEventListener("click", () => {
    document.querySelector(".window").classList.toggle("is-max");
    UI.statusRight("status.window.maximize.toggled");
  });

  document.getElementById("btnClose").addEventListener("click", () => {
    UI.statusRight("status.window.close.clicked");
  });
}

function initLanguageMenu() {
  const container = document.querySelector('[data-menu="language"]');
  const trigger = document.getElementById("langMenuButton");
  const popup = container.querySelector(".menu-popup");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !popup.hidden;

    closeAllMenus();
    popup.hidden = isOpen;
    trigger.setAttribute("aria-expanded", String(!isOpen));
    updateLanguageMenuChecks();
  });

  popup.addEventListener("click", async (e) => {
    const btn = e.target.closest(".menu-popup-item");
    if (!btn) return;

    const lang = btn.getAttribute("data-lang");
    await setLanguage(lang);

    updateLanguageMenuChecks();
    UI.statusRight("status.lang.changed");
    closeAllMenus();
  });

  document.addEventListener("click", () => closeAllMenus());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });
}

export function initShell() {
  initStatusBar();
  initWindowControls();
  initLanguageMenu();

  UI.statusLeft("status.placeholder");
  updateLanguageMenuChecks();
}
