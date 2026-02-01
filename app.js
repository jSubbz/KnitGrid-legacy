import { initLanguage } from "./i18n/i18n.js";
import { initShell } from "./shell/shell.js";
import { initContent } from "./content/content.js";
import { UI } from "./shell/uiBus.js";

async function main() {
  // i18n first so initial render uses real strings
  await initLanguage();

  // Shell (menus, window controls, status bar)
  initShell();

  // Content region
  initContent();

  // Optional: signal “boot complete”
  UI.statusRight("status.app.ready", { ttlMs: 1200 });
}

main();
