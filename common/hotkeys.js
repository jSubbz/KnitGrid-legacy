// common/hotkeys.js
import { UI } from "../shell/uiBus.js";

const STORAGE_KEY = "knitgrid.hotkeys.v1";

export const HotkeyMode = Object.freeze({
  DESIGN: "design",
  TRACK: "track",
});

/**
 * Symbol-oriented command ids for future growth.
 * The app can continue to use digit commands for now, but these give us a
 * clean vocabulary for buttons, palettes, and future remapping.
 */
export const DesignCommands = Object.freeze({
  UNDO: "history.undo",
  REDO: "history.redo",

  EDIT_SHAPE: "workspace.editShape",
  START_OVER: "workspace.startOver",
  TOGGLE_TRACKING: "workspace.mode.toggleTracking",

  CURSOR_LEFT: "design.cursor.left",
  CURSOR_RIGHT: "design.cursor.right",
  CURSOR_UP: "design.cursor.up",
  CURSOR_DOWN: "design.cursor.down",
  CURSOR_NEXT_ROW_START: "design.cursor.nextRowStart",

  SELECT_LEFT: "design.select.left",
  SELECT_RIGHT: "design.select.right",
  SELECT_UP: "design.select.up",
  SELECT_DOWN: "design.select.down",
  SELECT_CLEAR: "design.select.clear",
  SELECT_CAPTURE: "design.select.capture",

  PAINT_EMPTY: "design.paint.symbol.empty",
  PAINT_DOT: "design.paint.symbol.dot",
  PAINT_H: "design.paint.symbol.h",
  PAINT_V: "design.paint.symbol.v",
  PAINT_DIAG_FWD: "design.paint.symbol.diagFwd",
  PAINT_DIAG_BACK: "design.paint.symbol.diagBack",

  // legacy aliases still used by current content.js flow
  PAINT_DIGIT_0: "design.paint.digit.0",
  PAINT_DIGIT_1: "design.paint.digit.1",
  PAINT_DIGIT_2: "design.paint.digit.2",
  PAINT_DIGIT_3: "design.paint.digit.3",
  PAINT_DIGIT_4: "design.paint.digit.4",
  PAINT_DIGIT_5: "design.paint.digit.5",
  PAINT_DIGIT_6: "design.paint.digit.6",
  PAINT_DIGIT_7: "design.paint.digit.7",
  PAINT_DIGIT_8: "design.paint.digit.8",
  PAINT_DIGIT_9: "design.paint.digit.9",
});

const TRACK_COMMANDS = Object.freeze({
  TOGGLE_TRACKING: "workspace.mode.toggleTracking",
  PREV_STITCH: "track.step.prevStitch",
  NEXT_STITCH: "track.step.nextStitch",
  PREV_ROW: "track.step.prevRow",
  NEXT_ROW: "track.step.nextRow",
});

/**
 * Default bindings.
 * Key strings are normalized like:
 * "Ctrl+Z", "Ctrl+Shift+Z", "Shift+T", "ArrowLeft", "Space".
 */
export const DEFAULT_BINDINGS = Object.freeze({
  [HotkeyMode.DESIGN]: {
    // History
    "Ctrl+Z": DesignCommands.UNDO,
    "Ctrl+Shift+Z": DesignCommands.REDO,
    "Ctrl+Y": DesignCommands.REDO,

    // Workspace actions
    "E": DesignCommands.EDIT_SHAPE,
    "R": DesignCommands.START_OVER,
    "K": DesignCommands.TOGGLE_TRACKING,

    // Cursor movement
    "ArrowLeft": DesignCommands.CURSOR_LEFT,
    "ArrowRight": DesignCommands.CURSOR_RIGHT,
    "ArrowUp": DesignCommands.CURSOR_UP,
    "ArrowDown": DesignCommands.CURSOR_DOWN,

    // Jump to next row start
    "Enter": DesignCommands.CURSOR_NEXT_ROW_START,

    // Selection expand
    "Shift+ArrowLeft": DesignCommands.SELECT_LEFT,
    "Shift+ArrowRight": DesignCommands.SELECT_RIGHT,
    "Shift+ArrowUp": DesignCommands.SELECT_UP,
    "Shift+ArrowDown": DesignCommands.SELECT_DOWN,

    // Selection utilities
    "Escape": DesignCommands.SELECT_CLEAR,
    "T": DesignCommands.SELECT_CAPTURE,

    // Current paint bindings
    "0": DesignCommands.PAINT_DIGIT_0,
    "1": DesignCommands.PAINT_DIGIT_1,
    "2": DesignCommands.PAINT_DIGIT_2,
    "3": DesignCommands.PAINT_DIGIT_3,
    "4": DesignCommands.PAINT_DIGIT_4,
    "5": DesignCommands.PAINT_DIGIT_5,
    "6": DesignCommands.PAINT_DIGIT_6,
    "7": DesignCommands.PAINT_DIGIT_7,
    "8": DesignCommands.PAINT_DIGIT_8,
    "9": DesignCommands.PAINT_DIGIT_9,

    // Erase
    "Backspace": DesignCommands.PAINT_DIGIT_0,
  },

  [HotkeyMode.TRACK]: {
    "K": TRACK_COMMANDS.TOGGLE_TRACKING,
    "ArrowLeft": TRACK_COMMANDS.PREV_STITCH,
    "ArrowRight": TRACK_COMMANDS.NEXT_STITCH,
    "Backspace": TRACK_COMMANDS.PREV_STITCH,
    "Enter": TRACK_COMMANDS.NEXT_STITCH,
    "ArrowUp": TRACK_COMMANDS.PREV_ROW,
    "ArrowDown": TRACK_COMMANDS.NEXT_ROW,
  },
});

function isTypingContext(target) {
  if (!target) return false;
  const el = /** @type {HTMLElement} */ (target);
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

function normalizeKey(event) {
  const parts = [];

  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  let key = event.key;

  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
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
    // ignore storage failures
  }
}

/**
 * overrides[mode][commandId] = ["K", "Ctrl+K"]
 *
 * Returns an object shaped like:
 * {
 *   "Ctrl+Z": "history.undo",
 *   "1": "design.paint.digit.1"
 * }
 */
function buildEffectiveBindings(mode, overrides) {
  const base = DEFAULT_BINDINGS[mode] ?? {};
  const out = { ...base };

  const modeOverrides = overrides?.[mode];
  if (!modeOverrides || typeof modeOverrides !== "object") return out;

  for (const [commandId, keys] of Object.entries(modeOverrides)) {
    const list = Array.isArray(keys) ? keys : [keys];

    for (const [existingKey, existingCommandId] of Object.entries(out)) {
      if (existingCommandId === commandId) {
        delete out[existingKey];
      }
    }

    for (const key of list) {
      if (typeof key === "string" && key) {
        out[key] = commandId;
      }
    }
  }

  return out;
}

/**
 * Later we can migrate callers from digit commands to symbol commands without
 * breaking older bindings or saved overrides.
 */
function canonicalizeCommandId(commandId) {
  switch (commandId) {
    case DesignCommands.PAINT_EMPTY:
        return DesignCommands.PAINT_EMPTY;
    default:
      return commandId;
  }
}

function createCommandAliases(commandId) {
  const aliases = new Set([commandId]);

  switch (commandId) {
    case DesignCommands.PAINT_EMPTY:
    case DesignCommands.PAINT_DIGIT_0:
      aliases.add(DesignCommands.PAINT_EMPTY);
      aliases.add(DesignCommands.PAINT_DIGIT_0);
      break;

    case DesignCommands.PAINT_DOT:
    case DesignCommands.PAINT_DIGIT_1:
      aliases.add(DesignCommands.PAINT_DOT);
      aliases.add(DesignCommands.PAINT_DIGIT_1);
      break;

    case DesignCommands.PAINT_H:
    case DesignCommands.PAINT_DIGIT_2:
      aliases.add(DesignCommands.PAINT_H);
      aliases.add(DesignCommands.PAINT_DIGIT_2);
      break;

    case DesignCommands.PAINT_V:
    case DesignCommands.PAINT_DIGIT_3:
      aliases.add(DesignCommands.PAINT_V);
      aliases.add(DesignCommands.PAINT_DIGIT_3);
      break;

    case DesignCommands.PAINT_DIAG_FWD:
    case DesignCommands.PAINT_DIGIT_4:
      aliases.add(DesignCommands.PAINT_DIAG_FWD);
      aliases.add(DesignCommands.PAINT_DIGIT_4);
      break;

    case DesignCommands.PAINT_DIAG_BACK:
    case DesignCommands.PAINT_DIGIT_5:
      aliases.add(DesignCommands.PAINT_DIAG_BACK);
      aliases.add(DesignCommands.PAINT_DIGIT_5);
      break;

    default:
      break;
  }

  return [...aliases];
}

export function createHotkeys() {
  let mode = HotkeyMode.DESIGN;
  let overrides = loadOverrides();
  let effective = buildEffectiveBindings(mode, overrides);

  function setMode(nextMode) {
    mode = nextMode === HotkeyMode.TRACK ? HotkeyMode.TRACK : HotkeyMode.DESIGN;
    effective = buildEffectiveBindings(mode, overrides);
  }

  function getMode() {
    return mode;
  }

  function getKeyForCommand(commandId, forMode = mode) {
    const canonical = canonicalizeCommandId(commandId);
    const aliases = createCommandAliases(canonical);
    const bindings = buildEffectiveBindings(forMode, overrides);

    for (const [key, boundCommandId] of Object.entries(bindings)) {
      if (aliases.includes(boundCommandId)) return key;
    }

    return "";
  }

  function setUserBinding({ mode: forMode, commandId, keys }) {
    const targetMode = forMode === HotkeyMode.TRACK ? HotkeyMode.TRACK : HotkeyMode.DESIGN;
    const canonical = canonicalizeCommandId(commandId);

    if (!overrides[targetMode]) overrides[targetMode] = {};
    overrides[targetMode][canonical] = Array.isArray(keys) ? keys : [keys];

    saveOverrides(overrides);

    if (targetMode === mode) {
      effective = buildEffectiveBindings(mode, overrides);
    }
  }

  function clearUserBinding({ mode: forMode, commandId }) {
    const targetMode = forMode === HotkeyMode.TRACK ? HotkeyMode.TRACK : HotkeyMode.DESIGN;
    const canonical = canonicalizeCommandId(commandId);

    if (overrides?.[targetMode]) {
      delete overrides[targetMode][canonical];
      saveOverrides(overrides);

      if (targetMode === mode) {
        effective = buildEffectiveBindings(mode, overrides);
      }
    }
  }

  function handleKeydown(event) {
    if (isTypingContext(event.target)) return;

    const key = normalizeKey(event);
    const commandId = effective[key];
    if (!commandId) return;

    event.preventDefault();
    event.stopPropagation();

    UI.emit("hotkey:command", {
      commandId,
      key,
      mode,
    });
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