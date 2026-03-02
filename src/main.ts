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
const syntaxInfoEl = document.getElementById("syntaxInfo") as HTMLButtonElement;
const stepsEl = document.getElementById("steps") as HTMLInputElement;
const widthEl = document.getElementById("width") as HTMLInputElement;
const zoomEl = document.getElementById("zoom") as HTMLInputElement;
const seedEl = document.getElementById("seed") as HTMLInputElement;
const seedBandEl = document.getElementById("seedBand") as HTMLInputElement;
const boundaryModeEl = document.getElementById("boundaryMode") as HTMLSelectElement;
const stepsAutoEl = document.getElementById("stepsAuto") as HTMLInputElement;
const autoUpdateEl = document.getElementById("autoUpdate") as HTMLInputElement;
const newRandomBtn = document.getElementById("newRandom") as HTMLButtonElement;
const importRuleNameBtn = document.getElementById("importRuleName") as HTMLButtonElement;
const exportPngBtn = document.getElementById("exportPng") as HTMLButtonElement;
const openWolframBtn = document.getElementById("openWolfram") as HTMLButtonElement;
const playSpeedEl = document.getElementById("playSpeed") as HTMLInputElement;
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
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
let currentBoundaryMode: 0 | 1 | 2 = 0;
let errorsDismissed = false;
let lastErrorsSignature = "";
let lastRuleNameForCopy = "";
let copyTooltipTimer: number | null = null;
let streamAnimId: number | null = null;
let isPlaying = false;
let currentSpeed = 10;

function importRulesFromName(ruleNameRaw: string): string[] | null {
  const normalized = ruleNameRaw.trim().toLowerCase();
  const radiusMatch = normalized.match(/^rule\s+(\d+)\s+radius\s+(\d+)$/);
  const radiusFirstMatch = normalized.match(/^radius\s+(\d+)\s+rule\s+(\d+)$/);
  const legacyMatch = normalized.match(/^rule-(\d+)-base-(\d+)$/)
    || normalized.match(/^rule(\d+)base(\d+)$/);

  let value: bigint;
  let base: number;

  if (radiusMatch) {
    value = BigInt(radiusMatch[1]);
    const radius = Number(radiusMatch[2]);
    base = radius * 2 + 1;
  } else if (radiusFirstMatch) {
    value = BigInt(radiusFirstMatch[2]);
    const radius = Number(radiusFirstMatch[1]);
    base = radius * 2 + 1;
  } else if (legacyMatch) {
    value = BigInt(legacyMatch[1]);
    base = Number(legacyMatch[2]);
  } else {
    return null;
  }
  if (!Number.isFinite(base) || base < 1 || base % 2 === 0) return null;
  if (base > 12) return null;

  const totalPatterns = 1n << BigInt(base);
  const maxRuleValue = (1n << totalPatterns) - 1n;
  if (value > maxRuleValue) return null;

  const leftCtx = (base - 1) / 2;
  const lines: string[] = [];

  for (let idx = 0n; idx < totalPatterns; idx++) {
    if (((value >> idx) & 1n) === 0n) continue;

    const bits: number[] = [];
    for (let pos = 0; pos < base; pos++) {
      const shift = BigInt(base - 1 - pos);
      bits.push(Number((idx >> shift) & 1n));
    }

    const left = bits.slice(0, leftCtx).join("");
    const center = String(bits[leftCtx]);
    const right = bits.slice(leftCtx + 1).join("");
    lines.push(`${left}(${center})${right}`);
  }

  return lines;
}

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

function setBoundaryMode(value: string): void {
  if (value === "1") currentBoundaryMode = 1;
  else if (value === "wrap") currentBoundaryMode = 2;
  else currentBoundaryMode = 0;
}

function computeAutoSteps(): number {
  return Math.max(1, Math.floor((currentWidth - currentSeedBand) / 2));
}

function getEffectiveSteps(): number {
  return stepsAutoEl.checked ? computeAutoSteps() : currentSteps;
}

function ensureSize(): void {
  renderer.resize(currentWidth, getEffectiveSteps());
  setSeedBand(currentSeedBand);
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  applyScale();
}

function applyScale(): void {
  canvasEl.style.transform = "";
  canvasEl.style.setProperty("zoom", String(currentScale));
  updateCanvasWrapAlignment();
}

function updateCanvasWrapAlignment(): void {
  const renderedWidth = currentWidth * currentScale;
  const wrapWidth = canvasWrapEl.clientWidth;
  canvasWrapEl.classList.toggle("canvasWrapCentered", renderedWidth < wrapWidth);
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
}

function setupNumberControls(): void {
  const inputs = [stepsEl, widthEl, zoomEl, seedEl, seedBandEl, playSpeedEl];

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

    spinWrap.append(upBtn, downBtn);
    wrapper.appendChild(spinWrap);
  }
}

function setupWheelScrolling(): void {
  const numberInputs = [stepsEl, widthEl, zoomEl, seedEl, seedBandEl, playSpeedEl];
  for (const input of numberInputs) {
    input.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
      updateNumberInputByStep(input, dir);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, { passive: false });
  }

  const selects = [boundaryModeEl];
  for (const select of selects) {
    select.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? -1 : 1;
      const next = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + dir));
      if (next === select.selectedIndex) return;
      select.selectedIndex = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, { passive: false });
  }
}

// ── Update ───────────────────────────────────────────────────

function onUpdate(): void {
  const { entries, errors, syntaxErrors } = parseText(rulesEl.value);
  renderSyntaxErrors(syntaxErrors);
  if (entries.length === 0) {
    infoEl.textContent = errors > 0 ? `${errors} errors` : "no rules";
    simInfoEl.textContent = "";
    lastRuleNameForCopy = "";
    infoEl.classList.remove("infoCopyable");
    return;
  }

  const rule = fromEntries(entries);
  renderer.uploadTruthTable(rule.table, rule.leftCtx, rule.rightCtx);
  const effectiveSteps = getEffectiveSteps();

  const t0 = performance.now();
  renderer.simulate(effectiveSteps, currentBoundaryMode);
  renderer.display();
  const dt = (performance.now() - t0).toFixed(1);

  const displayRuleName = rule.name;
  lastRuleNameForCopy = displayRuleName;
  infoEl.classList.add("infoCopyable");
  infoEl.textContent = displayRuleName;
  simInfoEl.textContent = `${dt}ms`;
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

function stopPlay(): void {
  if (streamAnimId !== null) {
    cancelAnimationFrame(streamAnimId);
    streamAnimId = null;
  }
  isPlaying = false;
  playBtn.textContent = "play";
}

function startPlay(): void {
  const { entries } = parseText(rulesEl.value);
  if (entries.length === 0) return;

  const rule = fromEntries(entries);
  renderer.uploadTruthTable(rule.table, rule.leftCtx, rule.rightCtx);

  lastRuleNameForCopy = rule.name;
  infoEl.classList.add("infoCopyable");
  infoEl.textContent = rule.name;
  simInfoEl.textContent = "";

  renderer.beginStream(currentBoundaryMode);

  isPlaying = true;
  playBtn.textContent = "stop";

  function tick() {
    for (let i = 0; i < currentSpeed; i++) renderer.stepStream();
    renderer.display();
    streamAnimId = requestAnimationFrame(tick);
  }
  streamAnimId = requestAnimationFrame(tick);
}

function requestUpdate(): void {
  stopPlay();
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

importRuleNameBtn.addEventListener("click", () => {
  const raw = window.prompt("paste rule name like: rule 30 radius 1", lastRuleNameForCopy || "");
  if (!raw) return;

  const importedLines = importRulesFromName(raw);
  if (!importedLines) {
    infoEl.textContent = "invalid rule name format";
    return;
  }

  rulesEl.value = importedLines.join("\n") + (importedLines.length > 0 ? "\n" : "");
  onUpdate();
});

exportPngBtn.addEventListener("click", () => {
  const dataUrl = canvasEl.toDataURL("image/png");
  const fileBase = (lastRuleNameForCopy || "rule")
    .replace(/[^a-z0-9\-_.]+/gi, "_")
    .slice(0, 80);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${fileBase}_${timestamp}.png`;
  link.click();
});

openWolframBtn.addEventListener("click", () => {
  const m = lastRuleNameForCopy.match(/^rule\s+(\d+)\s+radius\s+(\d+)$/);
  if (!m) return;
  const url = `https://www.wolframalpha.com/input?i=radius+${m[2]}+rule+${m[1]}`;
  window.open(url, "_blank");
});

playSpeedEl.addEventListener("input", () => {
  currentSpeed = Math.max(1, parseInt(playSpeedEl.value) || 1);
});

playBtn.addEventListener("click", () => {
  if (isPlaying) {
    stopPlay();
    onUpdate();
  } else {
    startPlay();
  }
});

stepsEl.addEventListener("input", () => {
  if (stepsAutoEl.checked) {
    return;
  }
  currentSteps = Math.max(1, parseInt(stepsEl.value) || 100);
  ensureSize();
  requestUpdate();
});

widthEl.addEventListener("input", () => {
  currentWidth = Math.max(11, parseInt(widthEl.value) || 201);
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
  if (stepsAutoEl.checked) {
    ensureSize();
    requestUpdate();
    return;
  }
  renderer.randomize(currentWidth, currentSeed, currentSeedBand);
  requestUpdate();
});

boundaryModeEl.addEventListener("change", () => {
  setBoundaryMode(boundaryModeEl.value);
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

const SYNTAX_HELP = `  —  **RULE THE WORLDS** by master-ferrari  —
  —  1D cellular automaton editor  —  

( )   parentheses mark the center cell; under this cell will be placed 1
#     comment — line is ignored
x     wildcard — expands into two rules: one for 0, one for 1
-s    symmetry — generates the mirror rule around the center`;

syntaxInfoEl.addEventListener("click", () => {
  alert(SYNTAX_HELP);
});

infoEl.addEventListener("click", async () => {
  if (!lastRuleNameForCopy) return;
  try {
    await navigator.clipboard.writeText(lastRuleNameForCopy);
    infoEl.classList.add("infoCopied");
    if (copyTooltipTimer !== null) {
      window.clearTimeout(copyTooltipTimer);
    }
    copyTooltipTimer = window.setTimeout(() => {
      infoEl.classList.remove("infoCopied");
      copyTooltipTimer = null;
    }, 1200);
  } catch {
    infoEl.textContent = "copy failed";
  }
});

// ── Splitter drag ────────────────────────────────────────────

const splitterEl = document.getElementById("splitter")!;
const hSplitterEl = document.getElementById("hSplitter")!;
const controlPanelEl = document.getElementById("controlPanel")!;
const appEl = document.getElementById("app")!;

splitterEl.addEventListener("mousedown", (e: MouseEvent) => {
  e.preventDefault();
  appEl.classList.add("dragging");

  const onMove = (ev: MouseEvent) => {
    const padding = 8; // --sp
    const minW = 430;
    const maxW = window.innerWidth * 0.6;
    const w = Math.max(minW, Math.min(maxW, ev.clientX - padding));
    appEl.style.setProperty("--left-w", `${w}px`);
    updateCanvasWrapAlignment();
  };

  const onUp = () => {
    appEl.classList.remove("dragging");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
});


hSplitterEl.addEventListener("mousedown", (e: MouseEvent) => {
  e.preventDefault();
  appEl.classList.add("dragging");

  const startY = e.clientY;
  const startH = controlPanelEl.getBoundingClientRect().height;

  const onMove = (ev: MouseEvent) => {
    const minH = 32;
    const maxH = window.innerHeight * 0.7;
    const h = Math.max(minH, Math.min(maxH, startH + (ev.clientY - startY)));
    appEl.style.setProperty("--controls-h", `${h}px`);
  };

  const onUp = () => {
    appEl.classList.remove("dragging");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
});

window.addEventListener("resize", updateCanvasWrapAlignment);

// ── Init ─────────────────────────────────────────────────────

if (window.matchMedia("(orientation: portrait)").matches) {
  currentWidth = 420;
  widthEl.value = "420";
  zoomEl.value = "1";
}

setupNumberControls();
setupWheelScrolling();
setSeed(Number(seedEl.value) || 1);
setSeedBand(Number(seedBandEl.value) || 20);
setBoundaryMode(boundaryModeEl.value);
setScale(Number(zoomEl.value) || 5);
applyStepsAutoMode();
ensureSize();
onUpdate();
