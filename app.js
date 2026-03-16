// app.js
import { initLanguage } from "./i18n/i18n.js";
import { initShell } from "./shell/shell.js";
import { initContent } from "./content/content.js";
import { UI } from "./shell/uiBus.js";
import { createHotkeys } from "./common/hotkeys.js";

export const Hotkeys = createHotkeys();

async function main() {
  await initLanguage();
  initShell();

  Hotkeys.mount();

  initContent();
  UI.statusRight("status.app.ready", { ttlMs: 1200 });
}

main();