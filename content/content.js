import { UI } from "../shell/uiBus.js";

export function initContent() {
  // Content stays blank for now, but this proves the wiring works.
  // Later, content can emit messages like: UI.statusRight("status.something");
  UI.statusRight("status.content.ready", { ttlMs: 1500 });
}
