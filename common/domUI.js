export function renderCard({ titleKey, subtitleKey, bodyEl, actionsEl }) {
  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "card-header";

  const title = document.createElement("h2");
  title.className = "card-title";
  title.setAttribute("data-i18n", titleKey);
  title.textContent = titleKey;
  header.appendChild(title);

  if (subtitleKey) {
    const subtitle = document.createElement("p");
    subtitle.className = "card-subtitle";
    subtitle.setAttribute("data-i18n", subtitleKey);
    subtitle.textContent = subtitleKey;
    header.appendChild(subtitle);
  }

  const body = document.createElement("div");
  body.className = "card-body";
  body.appendChild(bodyEl);

  card.appendChild(header);
  card.appendChild(body);

  if (actionsEl) body.appendChild(actionsEl);
  return card;
}

export function mkButton({ key, className = "btn", onClick, pressed, disabled }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  if (typeof pressed === "boolean") b.setAttribute("aria-pressed", String(pressed));
  if (disabled) b.disabled = true;

  b.setAttribute("data-i18n", key);
  b.textContent = key;
  b.addEventListener("click", onClick);
  return b;
}

export function mkField({ labelKey, inputEl }) {
  const wrap = document.createElement("div");
  wrap.className = "field";

  const label = document.createElement("div");
  label.className = "label";
  label.setAttribute("data-i18n", labelKey);
  label.textContent = labelKey;

  wrap.appendChild(label);
  wrap.appendChild(inputEl);
  return wrap;
}
