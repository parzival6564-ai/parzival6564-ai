#!/usr/bin/env node
// contrib-snake: renders an animated snake that eats the cells of a real
// GitHub contribution calendar.
//
//   node scripts/contrib-snake.mjs <user> <outDir> [--html saved-page.html]
//
// Data comes from the public calendar page
// (https://github.com/users/<user>/contributions, no token needed), and the
// output mirrors github.com exactly: same days, same data-level per day, the
// Primer contribution palette, 11px cells, 2px radius, 15px pitch, the same
// month columns. The script re-parses what it wrote and exits non-zero if a
// single cell differs, so a broken page never gets published.
// Zero dependencies: Node 18+ (global fetch).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const THEMES = [
  {
    file: "snake-dark.svg",
    // Primer --contribution-default-bgColor-0..4 (dark)
    levels: ["#151b23", "#033a16", "#196c2e", "#2ea043", "#56d364"],
    label: "#9198a1",
    snake: "#d29922",
  },
  {
    file: "snake-light.svg",
    // Primer --contribution-default-bgColor-0..4 (light)
    levels: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"],
    label: "#59636e",
    snake: "#9a6700",
  },
];

// Geometry measured on github.com: 11px day, 4px border-spacing, 29px label column.
const CELL = 11;
const PITCH = 15;
const RADIUS = 2;
const LABEL_COL = 29 + 4;
const WIDTH = 830;
const MONTH_Y = 12;
const GRID_Y = 22;
const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif';

// Snake behaviour
const BASE_LEN = 4;
const MAX_LEN = 12;
const STEP_MS = 85;
const MAX_MOVE_MS = 36000;
const RESET_MS = 2200;

const WEEKDAYS = { 1: "Mon", 3: "Wed", 5: "Fri" };

async function fetchCalendar(user) {
  const url = `https://github.com/users/${encodeURIComponent(user)}/contributions`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": `contrib-snake (github.com/${user})`, accept: "text/html" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2500));
    }
  }
}

export function parseCalendar(html) {
  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
    const id = /id="contribution-day-component-(\d+)-(\d+)"/.exec(m[0]);
    const level = /data-level="(\d)"/.exec(m[0]);
    if (!id || !level) continue;
    days.push({ date: m[1], row: +id[1], col: +id[2], level: +level[1] });
  }
  const months = [];
  const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  let col = 0;
  for (const m of thead.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)) {
    if (!/ContributionCalendar-label/.test(m[1])) continue;
    const span = +(/colspan="(\d+)"/.exec(m[1])?.[1] ?? 1);
    const label = /aria-hidden="true"[^>]*>([^<]*)</.exec(m[2])?.[1].trim();
    if (label) months.push({ col, label });
    col += span;
  }
  const total = /([\d,]+)\s+contributions?\s+in the last year/.exec(html)?.[1] ?? null;
  return { days, months, total };
}

function validate({ days }) {
  if (days.length < 300) throw new Error(`calendar page changed: only ${days.length} days parsed`);
  const seen = new Set();
  for (const d of days) {
    const key = `${d.col}:${d.row}`;
    if (seen.has(key) || d.row > 6 || d.level > 4) throw new Error(`bad cell ${d.date}`);
    seen.add(key);
  }
}

// ---------------------------------------------------------------- snake path
function walk(path, from, to) {
  let { col, row } = from;
  while (col !== to.col) path.push({ col: (col += Math.sign(to.col - col)), row });
  while (row !== to.row) path.push({ col, row: (row += Math.sign(to.row - row)) });
}

function planRoute(days, gridX) {
  const targets = days.filter((d) => d.level > 0);
  const start = { col: -4, row: 0 }; // off canvas, on the unlabelled Sunday row
  const path = [start];
  let cur = start;
  const left = [...targets];
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((t, i) => {
      const d = Math.abs(t.col - cur.col) + Math.abs(t.row - cur.row);
      const b = left[best];
      if (d < bestD || (d === bestD && (t.col < b.col || (t.col === b.col && t.row < b.row)))) {
        bestD = d;
        best = i;
      }
    });
    const t = left.splice(best, 1)[0];
    walk(path, cur, t);
    cur = t;
  }
  const exitCol = Math.ceil((WIDTH - gridX) / PITCH) + MAX_LEN + 1;
  walk(path, cur, { col: exitCol, row: cur.row });

  // eat step = first time the head enters a coloured cell
  const byKey = new Map(targets.map((d) => [`${d.col}:${d.row}`, d]));
  const eatAt = new Map();
  path.forEach((p, s) => {
    const d = byKey.get(`${p.col}:${p.row}`);
    if (d && !eatAt.has(d)) eatAt.set(d, s);
  });
  return { path, eatAt };
}

// ---------------------------------------------------------------- render
const r2 = (n) => Math.round(n * 1000) / 1000;
const pct = (n) => `${r2(n)}%`;

function render(cal, theme, user) {
  const cols = Math.max(...cal.days.map((d) => d.col)) + 1;
  const gridW = cols * PITCH - (PITCH - CELL);
  const left = Math.round((WIDTH - (LABEL_COL + gridW)) / 2);
  const gridX = left + LABEL_COL;
  const gridBottom = GRID_Y + 7 * PITCH - (PITCH - CELL);
  const legendY = gridBottom + 12;
  const height = legendY + CELL + 6;
  const cx = (col) => gridX + col * PITCH + CELL / 2;
  const cy = (row) => GRID_Y + row * PITCH + CELL / 2;

  const { path, eatAt } = planRoute(cal.days, gridX);
  const S = path.length - 1;
  const step = Math.min(STEP_MS, MAX_MOVE_MS / Math.max(S, 1));
  const moveMs = S * step;
  const T = Math.round(moveMs + RESET_MS);
  const at = (s) => (s * step * 100) / T;

  // snake length grows by one per eaten day
  const eatSteps = [...eatAt.values()].sort((a, b) => a - b);
  const lenAt = (s) => Math.min(MAX_LEN, BASE_LEN + eatSteps.filter((e) => e <= s).length);

  const css = [];
  const segs = [];
  for (let i = MAX_LEN - 1; i >= 0; i--) {
    const pos = [];
    for (let s = 0; s <= S; s++) pos.push(path[Math.max(0, s - Math.min(i, lenAt(s) - 1))]);
    const frames = [];
    for (let s = 0; s <= S; s++) {
      const p = pos[s];
      if (s > 0 && s < S) {
        const a = pos[s - 1];
        const b = pos[s + 1];
        if (p.col - a.col === b.col - p.col && p.row - a.row === b.row - p.row) continue;
      }
      frames.push(`${pct(at(s))}{transform:translate(${r2(cx(p.col))}px,${r2(cy(p.row))}px)}`);
    }
    const last = pos[S];
    frames.push(`100%{transform:translate(${r2(cx(last.col))}px,${r2(cy(last.row))}px)}`);
    css.push(`@keyframes m${i}{${frames.join("")}}.s${i}{animation-name:m${i}}`);
    const size = r2(CELL - (i / (MAX_LEN - 1)) * 5);
    const start = path[0];
    segs.push(
      `<rect class="s s${i}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${i === 0 ? 3 : 2.5}" transform="translate(${r2(cx(start.col))} ${r2(cy(start.row))})"/>`,
    );
  }

  const cells = [];
  let n = 0;
  for (const d of cal.days) {
    const fill = theme.levels[d.level];
    let cls = "";
    if (eatAt.has(d)) {
      const k = `e${n++}`;
      const pe = at(eatAt.get(d));
      const back0 = ((moveMs + 250) * 100) / T;
      const back1 = ((moveMs + 1100) * 100) / T;
      css.push(
        `@keyframes ${k}{0%,${pct(pe)}{fill:${fill}}${pct(pe + 0.01)},${pct(back0)}{fill:${theme.levels[0]}}${pct(back1)},100%{fill:${fill}}}.${k}{animation:${k} ${T}ms linear infinite}`,
      );
      cls = ` class="e ${k}"`;
    }
    cells.push(
      `<rect${cls} x="${gridX + d.col * PITCH}" y="${GRID_Y + d.row * PITCH}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${fill}" data-date="${d.date}" data-level="${d.level}"/>`,
    );
  }

  const labels = [
    ...cal.months.map(
      (m) => `<text x="${gridX + m.col * PITCH}" y="${MONTH_Y}">${m.label}</text>`,
    ),
    ...Object.entries(WEEKDAYS).map(
      ([row, name]) => `<text x="${left}" y="${GRID_Y + row * PITCH + 9.5}">${name}</text>`,
    ),
  ];

  // legend: Less [0..4] More, right-aligned to the grid like github.com
  const gridRight = gridX + gridW;
  const legendCells = theme.levels.map(
    (c, i) =>
      `<rect x="${gridRight - 33 - (5 - i) * PITCH + 4}" y="${legendY}" width="${CELL}" height="${CELL}" rx="${RADIUS}" fill="${c}"/>`,
  );
  const legend = [
    `<text x="${gridRight - 33 - 5 * PITCH}" y="${legendY + 9.5}" text-anchor="end">Less</text>`,
    ...legendCells,
    `<text x="${gridRight - 29}" y="${legendY + 9.5}">More</text>`,
  ];

  const active = cal.days.filter((d) => d.level > 0).length;
  const desc = `${cal.total ?? "?"} contributions on ${active} days in the last year, drawn from github.com/${user}. A snake travels across the calendar and eats every coloured day.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="t d">
<title id="t">Contribution calendar of @${user}</title>
<desc id="d">${desc}</desc>
<style>
text{font:12px ${FONT};fill:${theme.label}}
.s{fill:${theme.snake};animation:${T}ms linear infinite}
${css.join("\n")}
@media (prefers-reduced-motion:reduce){.s,.e{animation:none}}
</style>
<g>${labels.join("")}</g>
<g>${cells.join("\n")}</g>
<g>${legend.join("")}</g>
<g>${segs.join("")}</g>
</svg>
`;
}

// ---------------------------------------------------------------- parity check
export function verify(svg, cal, theme) {
  const want = new Map(cal.days.map((d) => [d.date, d]));
  const problems = [];
  let count = 0;
  const xs = new Set();
  for (const m of svg.matchAll(/<rect\b[^>]*data-date="([^"]+)"[^>]*>/g)) {
    count++;
    const tag = m[0];
    const get = (a) => new RegExp(`\\b${a}="([^"]*)"`).exec(tag)?.[1];
    const d = want.get(m[1]);
    const level = +get("data-level");
    if (!d) problems.push(`${m[1]}: not on github.com`);
    else if (level !== d.level) problems.push(`${m[1]}: level ${level} != ${d.level}`);
    if (get("fill") !== theme.levels[level]) problems.push(`${m[1]}: fill ${get("fill")}`);
    if (get("width") !== `${CELL}` || get("height") !== `${CELL}` || get("rx") !== `${RADIUS}`)
      problems.push(`${m[1]}: geometry`);
    if (d) xs.add(`${+get("x") - d.col * PITCH}|${+get("y") - d.row * PITCH}`);
  }
  if (count !== cal.days.length) problems.push(`cell count ${count} != ${cal.days.length}`);
  if (xs.size !== 1) problems.push("cells are not on one 15px lattice");
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const htmlFlag = args.indexOf("--html");
  const htmlPath = htmlFlag >= 0 ? args.splice(htmlFlag, 2)[1] : null;
  const user = args[0] ?? process.env.GITHUB_REPOSITORY_OWNER;
  const outDir = args[1] ?? "dist";
  if (!user) throw new Error("usage: contrib-snake.mjs <user> <outDir> [--html file]");

  const html = htmlPath ? await readFile(htmlPath, "utf8") : await fetchCalendar(user);
  const cal = parseCalendar(html);
  validate(cal);

  await mkdir(outDir, { recursive: true });
  for (const theme of THEMES) {
    const svg = render(cal, theme, user);
    const problems = verify(svg, cal, theme);
    if (problems.length) throw new Error(`${theme.file} parity failed:\n${problems.join("\n")}`);
    await writeFile(join(outDir, theme.file), svg);
    console.log(`${theme.file}: ${cal.days.length} days, ${cal.days.filter((d) => d.level).length} active, parity ok`);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
