import "./style.css";
import { parseText, fromEntries } from "./parser";
import { Renderer } from "./renderer";

// ── DOM ──────────────────────────────────────────────────────

const rulesEl = document.getElementById("rules") as HTMLTextAreaElement;
const infoEl = document.getElementById("info")!;
const simInfoEl = document.getElementById("simInfo")!;
const errorsPanelEl = document.getElementById("errorsPanel")!;
const errorsListEl = document.getElementById("errorsList")!;
const errorsCloseEl = document.getElementById("errorsClose") as HTMLButtonElement;
const stepsEl = document.getElementById("steps") as HTMLInputElement;
const widthEl = document.getElementById("width") as HTMLInputElement;
const zoomEl = document.getElementById("zoom") as HTMLInputElement;
const seedEl = document.getElementById("seed") as HTMLInputElement;
const seedBandEl = document.getElementById("seedBand") as HTMLInputElement;
const stepsAutoEl = document.getElementById("stepsAuto") as HTMLInputElement;
const autoUpdateEl = document.getElementById("autoUpdate") as HTMLInputElement;
const newRandomBtn = document.getElementById("newRandom") as HTMLButtonElement;
const canvasEl = document.getElementById("canvas") as HTMLCanvasElement;
const canvasWrapEl = document.getElementById("canvasWrap") as HTMLDivElement;
// const canvasZoomEl = document.getElementById("canvas-holder") as HTMLDivElement;
const SCALE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50];

// ── Renderer ─────────────────────────────────────────────────

const renderer = new Renderer(canvasEl);
renderer.init();

// ── State ────────────────────────────────────────────────────

let currentWidth = parseInt(widthEl.value);
let currentSteps = parseInt(stepsEl.value);
let currentScale = parseInt(zoomEl.value);
let currentSeed = Number(seedEl.value) || 1;
let currentSeedBand = Number(seedBandEl.value) || 20;
let errorsDismissed = false;
let lastErrorsSignature = "";
let lastRuleNameForCopy = "";

function clampToInputRange(input: HTMLInputElement, value: number): number {
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  return Math.max(min, Math.min(max, value));
}

function getStep(input: HTMLInputElement): number {
  const parsed = Number(input.step);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function snapScale(value: number): number {
  return SCALE_PRESETS.reduce((closest, preset) => {
    const currentDist = Math.abs(value - closest);
    const presetDist = Math.abs(value - preset);
    return presetDist < currentDist ? preset : closest;
  }, SCALE_PRESETS[0]);
}

function setScale(nextValue: number): void {
  currentScale = snapScale(nextValue);
  zoomEl.value = String(currentScale);
  applyScale();
}

function normalizeSeed(nextValue: number): number {
  if (!Number.isFinite(nextValue)) return 1;
  return Math.max(0, Math.floor(nextValue));
}

function setSeed(nextValue: number): void {
  currentSeed = normalizeSeed(nextValue);
  seedEl.value = String(currentSeed);
}

function normalizeSeedBand(nextValue: number): number {
  if (!Number.isFinite(nextValue)) return 20;
  return Math.max(1, Math.min(currentWidth, Math.floor(nextValue)));
}

function setSeedBand(nextValue: number): void {
  currentSeedBand = normalizeSeedBand(nextValue);
  seedBandEl.value = String(currentSeedBand);
}

function computeAutoSteps(): number {
  return Math.max(1, Math.floor((currentWidth - currentSeedBand) / 2));
}

function syncAutoSteps(): void {
  if (!stepsAutoEl.checked) return;
  currentSteps = computeAutoSteps();
  stepsEl.value = String(currentSteps);
}

function ensureSize(): void {
  syncAutoSteps();
  renderer.resize(currentWidth, currentSteps);
  setSeedBand(currentSeedBand);
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  applyScale();
}

function applyScale(): void {
  canvasEl.style.transform = `scale(${currentScale})`;
  canvasWrapEl.classList.toggle("canvasWrapNoCenter", currentScale > 1);
}

function updateNumberInputByStep(input: HTMLInputElement, direction: 1 | -1): void {
  if (input.disabled) return;

  if (input === zoomEl) {
    const currentIndex = SCALE_PRESETS.indexOf(snapScale(Number(input.value) || currentScale));
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = Math.max(0, Math.min(SCALE_PRESETS.length - 1, safeIndex + direction));
    setScale(SCALE_PRESETS[nextIndex]);
    return;
  }

  const step = getStep(input);
  const current = Number(input.value) || 0;
  const next = clampToInputRange(input, current + direction * step);
  input.value = String(next);
}

function setNumberControlDisabled(input: HTMLInputElement, disabled: boolean): void {
  input.disabled = disabled;
  const wrapper = input.closest(".numberControl");
  wrapper?.classList.toggle("numberControlDisabled", disabled);
}

function applyStepsAutoMode(): void {
  const isAuto = stepsAutoEl.checked;
  setNumberControlDisabled(stepsEl, isAuto);
  if (isAuto) {
    syncAutoSteps();
  }
}

function setupNumberControls(): void {
  const inputs = [stepsEl, widthEl, zoomEl, seedEl, seedBandEl];

  for (const input of inputs) {
    const wrapper = document.createElement("span");
    wrapper.className = "numberControl";
    input.parentElement?.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const spinWrap = document.createElement("span");
    spinWrap.className = "numberSpinButtons";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "numberSpinButton";
    upBtn.setAttribute("aria-label", "Increase");
    upBtn.innerHTML = `<svg class="numberSpinIcon" viewBox="0 0 9 5" aria-hidden="true"><path d="M1 4L4.5 1L8 4"/></svg>`;

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "numberSpinButton";
    downBtn.setAttribute("aria-label", "Decrease");
    downBtn.innerHTML = `<svg class="numberSpinIcon" viewBox="0 0 9 5" aria-hidden="true"><path d="M1 1L4.5 4L8 1"/></svg>`;

    upBtn.addEventListener("click", () => {
      updateNumberInputByStep(input, 1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    downBtn.addEventListener("click", () => {
      updateNumberInputByStep(input, -1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    input.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction: 1 | -1 = event.deltaY < 0 ? 1 : -1;
      updateNumberInputByStep(input, direction);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, { passive: false });

    spinWrap.append(upBtn, downBtn);
    wrapper.appendChild(spinWrap);
  }
}

// ── Update ───────────────────────────────────────────────────

function onUpdate(): void {
  const { entries, errors, syntaxErrors } = parseText(rulesEl.value);
  renderSyntaxErrors(syntaxErrors);
  if (entries.length === 0) {
    infoEl.textContent = errors > 0 ? `${errors} errors` : "no rules";
    lastRuleNameForCopy = "";
    infoEl.classList.remove("infoCopyable");
    infoEl.removeAttribute("title");
    return;
  }

  const rule = fromEntries(entries);
  renderer.uploadTruthTable(rule.table, rule.leftCtx, rule.rightCtx);

  const t0 = performance.now();
  renderer.simulate(currentSteps);
  renderer.display();
  const dt = (performance.now() - t0).toFixed(1);

  const displayRuleName = rule.name.startsWith("rule") ? `rule-${rule.name.slice(4)}` : rule.name;
  lastRuleNameForCopy = displayRuleName;
  infoEl.classList.add("infoCopyable");
  infoEl.title = "click to copy rule name";
  infoEl.textContent = `${displayRuleName} | ${dt}ms`;
  simInfoEl.textContent = "";
}

function renderSyntaxErrors(
  syntaxErrors: Array<{ line: number; message: string; raw: string }>
): void {
  if (syntaxErrors.length === 0) {
    errorsPanelEl.classList.add("hidden");
    errorsListEl.textContent = "";
    lastErrorsSignature = "";
    errorsDismissed = false;
    return;
  }

  const signature = syntaxErrors.map((e) => `${e.line}:${e.message}:${e.raw}`).join("|");
  if (signature !== lastErrorsSignature) {
    errorsDismissed = false;
    lastErrorsSignature = signature;
  }

  const list = syntaxErrors.map((e) => {
    const source = e.raw || e.message;
    return `syntax error on line ${e.line} : ${source}`;
  });
  errorsListEl.textContent = list.join("\n");

  if (errorsDismissed) {
    errorsPanelEl.classList.add("hidden");
  } else {
    errorsPanelEl.classList.remove("hidden");
  }
}

function requestUpdate(): void {
  if (!autoUpdateEl.checked) return;
  onUpdate();
}

// ── Events ───────────────────────────────────────────────────

rulesEl.addEventListener("input", requestUpdate);

newRandomBtn.addEventListener("click", () => {
  setSeed(Math.floor(Math.random() * 0x100000000));
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  requestUpdate();
});

stepsEl.addEventListener("input", () => {
  if (stepsAutoEl.checked) {
    syncAutoSteps();
    return;
  }
  currentSteps = Math.max(1, parseInt(stepsEl.value) || 100);
  ensureSize();
  requestUpdate();
});

widthEl.addEventListener("input", () => {
  currentWidth = Math.max(11, parseInt(widthEl.value) || 201);
  syncAutoSteps();
  ensureSize();
  requestUpdate();
});

zoomEl.addEventListener("input", () => {
  setScale(Number(zoomEl.value) || 5);
  requestUpdate();
});

seedEl.addEventListener("input", () => {
  setSeed(Number(seedEl.value));
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  requestUpdate();
});

seedBandEl.addEventListener("input", () => {
  setSeedBand(Number(seedBandEl.value));
  syncAutoSteps();
  if (stepsAutoEl.checked) {
    ensureSize();
    requestUpdate();
    return;
  }
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  requestUpdate();
});

stepsAutoEl.addEventListener("change", () => {
  applyStepsAutoMode();
  ensureSize();
  requestUpdate();
});

autoUpdateEl.addEventListener("change", () => {
  if (!autoUpdateEl.checked) return;
  onUpdate();
});

errorsCloseEl.addEventListener("click", () => {
  errorsDismissed = true;
  errorsPanelEl.classList.add("hidden");
});

infoEl.addEventListener("click", async () => {
  if (!lastRuleNameForCopy) return;
  await navigator.clipboard.writeText(lastRuleNameForCopy);
});

// ── Splitter drag ────────────────────────────────────────────

const splitterEl = document.getElementById("splitter")!;
const appEl = document.getElementById("app")!;

splitterEl.addEventListener("mousedown", (e: MouseEvent) => {
  e.preventDefault();
  appEl.classList.add("dragging");

  const onMove = (ev: MouseEvent) => {
    const padding = 8; // --sp
    const minW = 160;
    const maxW = window.innerWidth * 0.6;
    const w = Math.max(minW, Math.min(maxW, ev.clientX - padding));
    appEl.style.setProperty("--left-w", `${w}px`);
  };

  const onUp = () => {
    appEl.classList.remove("dragging");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
});

// ── Init ─────────────────────────────────────────────────────

setupNumberControls();
setSeed(Number(seedEl.value) || 1);
setSeedBand(Number(seedBandEl.value) || 20);
setScale(Number(zoomEl.value) || 5);
applyStepsAutoMode();
ensureSize();
onUpdate();
