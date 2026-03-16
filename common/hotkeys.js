// common/hotkeys.js
import { UI } from "../shell/uiBus.js";

const STORAGE_KEY = "knitgrid.hotkeys.v1";

export const HotkeyMode = Object.freeze({
  DESIGN: "design",
  TRACK: "track",
});

/**
 * Default bindings.
 * Key strings are normalized like: "Ctrl+Z", "Shift+T", "ArrowLeft", "Space".
 */
export const DEFAULT_BINDINGS = Object.freeze({
  [HotkeyMode.DESIGN]: {
    // History
    "Ctrl+Z": "history.undo",
    "Ctrl+Shift+Z": "history.redo",
    "Ctrl+Y": "history.redo",

    // Workspace actions
    "E": "workspace.editShape",
    "R": "workspace.startOver",

    // Cursor movement
    "ArrowLeft": "design.cursor.left",
    "ArrowRight": "design.cursor.right",
    "ArrowUp": "design.cursor.up",
    "ArrowDown": "design.cursor.down",

    // Jump to next row start (your Enter behavior)
    "Enter": "design.cursor.nextRowStart",

    // Selection expand (Shift+Arrow)
    "Shift+ArrowLeft": "design.select.left",
    "Shift+ArrowRight": "design.select.right",
    "Shift+ArrowUp": "design.select.up",
    "Shift+ArrowDown": "design.select.down",

    // Selection utilities
    "Escape": "design.select.clear",
    "T": "design.select.capture",

    // Digit paint (0–9)
    "0": "design.paint.digit.0",
    "1": "design.paint.digit.1",
    "2": "design.paint.digit.2",
    "3": "design.paint.digit.3",
    "4": "design.paint.digit.4",
    "5": "design.paint.digit.5",
    "6": "design.paint.digit.6",
    "7": "design.paint.digit.7",
    "8": "design.paint.digit.8",
    "9": "design.paint.digit.9",

    // Erase (maps to 0)
    "Backspace": "design.paint.digit.0",
  },

  [HotkeyMode.TRACK]: {
    "K": "workspace.mode.toggleTracking",
    "ArrowLeft": "track.step.prevStitch",
    "ArrowRight": "track.step.nextStitch",
    "Backspace": "track.step.prevStitch",
    "Enter": "track.step.nextStitch",
    "ArrowUp": "track.step.prevRow",
    "ArrowDown": "track.step.nextRow",
  },
});

function isTypingContext(target) {
  if (!target) return false;
  const el = /** @type {HTMLElement} */ (target);
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

function normalizeKey(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let k = e.key;
  if (k === " ") k = "Space";
  if (k.length === 1) k = k.toUpperCase();

  parts.push(k);
  return parts.join("+");
}

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

/**
 * overrides[mode][commandId] = ["K", "Ctrl+K"]
 */
function buildEffectiveBindings(mode, overrides) {
  const base = DEFAULT_BINDINGS[mode] ?? {};
  const out = { ...base };

  const modeOv = overrides?.[mode];
  if (!modeOv) return out;

  for (const [commandId, keys] of Object.entries(modeOv)) {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const key of arr) out[key] = commandId;
  }

  return out;
}

export function createHotkeys() {
  let mode = HotkeyMode.DESIGN;
  let overrides = loadOverrides();
  let effective = buildEffectiveBindings(mode, overrides);

  function setMode(nextMode) {
    mode = nextMode;
    effective = buildEffectiveBindings(mode, overrides);
  }

  function getMode() {
    return mode;
  }

  function getKeyForCommand(commandId, forMode = mode) {
    const bindings = buildEffectiveBindings(forMode, overrides);
    for (const [k, cmd] of Object.entries(bindings)) {
      if (cmd === commandId) return k;
    }
    return "";
  }

  function setUserBinding({ mode: forMode, commandId, keys }) {
    if (!overrides[forMode]) overrides[forMode] = {};
    overrides[forMode][commandId] = Array.isArray(keys) ? keys : [keys];
    saveOverrides(overrides);
    if (forMode === mode) effective = buildEffectiveBindings(mode, overrides);
  }

  function clearUserBinding({ mode: forMode, commandId }) {
    if (overrides?.[forMode]) {
      delete overrides[forMode][commandId];
      saveOverrides(overrides);
      if (forMode === mode) effective = buildEffectiveBindings(mode, overrides);
    }
  }

  function handleKeydown(e) {
    if (isTypingContext(e.target)) return;

    const key = normalizeKey(e);
    const commandId = effective[key];
    if (!commandId) return;

    e.preventDefault();
    e.stopPropagation();

    UI.emit("hotkey:command", { commandId, key, mode });
  }

  function mount() {
    window.addEventListener("keydown", handleKeydown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeydown, { capture: true });
  }

  return {
    mount,
    setMode,
    getMode,
    getKeyForCommand,
    setUserBinding,
    clearUserBinding,
  };
}