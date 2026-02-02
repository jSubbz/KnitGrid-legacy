import { renderCard, mkButton } from "../common/domUI.js";

export function renderWorkspace({ state, actions }) {
  const body = document.createElement("div");

  const ws = document.createElement("div");
  ws.className = "workspace";

  const left = document.createElement("div");
  left.className = "sidepanel";
  left.setAttribute("data-i18n", "workspace.left.placeholder");
  left.textContent = "workspace.left.placeholder";

  const right = document.createElement("div");
  right.className = "sidepanel";
  right.setAttribute("data-i18n", "workspace.right.placeholder");
  right.textContent = "workspace.right.placeholder";

  const center = document.createElement("div");
  center.className = "centerpanel";

  const header = document.createElement("div");
  header.className = "centerpanel-header";

  const title = document.createElement("h3");
  title.className = "centerpanel-title";
  title.setAttribute("data-i18n", "workspace.title");
  title.textContent = "workspace.title";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${state.cols} × ${state.rows} | ${state.knitMode}`;

  header.appendChild(title);
  header.appendChild(meta);
  center.appendChild(header);

  const wrap = document.createElement("div");
  wrap.className = "grid-wrap centered";
  wrap.style.setProperty("--cell", "18px");

  const grid = document.createElement("div");
  grid.className = "grid";

  const s = state.confirmedShape;
  const rows = s?.rows ?? state.rows;
  const cols = s?.cols ?? state.cols;
  const data = s?.data ?? state.shape;

  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  grid.style.gridTemplateRows = `repeat(${rows}, var(--cell))`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "cell" + (data[r][c] ? " on" : "");
      grid.appendChild(cell);
    }
  }

  wrap.appendChild(grid);
  center.appendChild(wrap);

  ws.appendChild(left);
  ws.appendChild(center);
  ws.appendChild(right);

  body.appendChild(ws);

  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";

  actionsEl.appendChild(mkButton({
    key: "workspace.editShape",
    className: "btn",
    onClick: actions.goToShape,
  }));

  actionsEl.appendChild(mkButton({
    key: "workspace.startOver",
    className: "btn btn-danger",
    onClick: actions.startOver,
  }));

  return renderCard({
    titleKey: "workspace.cardTitle",
    subtitleKey: "workspace.subtitle",
    bodyEl: body,
    actionsEl,
  });
}
