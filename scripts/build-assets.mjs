#!/usr/bin/env node
// Builds the static SVGs in /assets (dark + light variant of each).
//
//   node scripts/build-assets.mjs
//
// Every colour is a GitHub Primer token, so the pieces sit on github.com like
// native UI: neutrals for structure, the contribution-graph greens as the one
// accent family, Primer "attention" amber only for things that move (cursor,
// snake). Fonts are system stacks; motion is transform/opacity only and is
// switched off under prefers-reduced-motion.
// Brand glyphs: Simple Icons (CC0), fetched at a pinned version. C# and
// PowerShell are not in Simple Icons, so they are drawn here as plain glyphs.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../assets/", import.meta.url));
const SI = "https://cdn.jsdelivr.net/npm/simple-icons@16.36.0/icons";

const MONO = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace';
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif';
const EASE = "cubic-bezier(.16,1,.3,1)";

const THEMES = {
  dark: {
    bg: "#0d1117", inset: "#010409", border: "#3d444d", fg: "#f0f6fc", muted: "#9198a1",
    subtle: "#656c76", green: "#3fb950", amber: "#d29922",
    levels: ["#151b23", "#033a16", "#196c2e", "#2ea043", "#56d364"], glow: 0.09, field: 1,
  },
  light: {
    bg: "#ffffff", inset: "#f6f8fa", border: "#d1d9e0", fg: "#1f2328", muted: "#59636e",
    subtle: "#818b98", green: "#1a7f37", amber: "#9a6700",
    levels: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"], glow: 0.07, field: 0.72,
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r3 = (n) => Math.round(n * 1000) / 1000;

const svg = ({ w, h, title, desc, style = "", body }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${style}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
${body}
</svg>
`;

// ------------------------------------------------------------------ glyphs
const OCT = {
  branch:
    "M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
  repo:
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

async function simpleIcon(slug) {
  const res = await fetch(`${SI}/${slug}.svg`);
  if (!res.ok) throw new Error(`simple-icons ${slug}: HTTP ${res.status}`);
  const d = /<path d="([^"]+)"/.exec(await res.text())?.[1];
  if (!d) throw new Error(`simple-icons ${slug}: no path`);
  return d;
}

// glyph(x, y, size, colour, knockout) -> svg markup, 24-unit artboard
function drawnGlyph(kind) {
  if (kind === "csharp")
    return (fill, hole) =>
      `<path fill="${fill}" d="M12 1.2 21.6 6.6v10.8L12 22.8 2.4 17.4V6.6Z"/>` +
      `<text x="12" y="15.6" fill="${hole}" font-family='${MONO}' font-size="9" font-weight="700" text-anchor="middle">C#</text>`;
  if (kind === "powershell")
    return (fill, hole) =>
      `<path fill="${fill}" d="M5.4 3.5h17.1c.7 0 1.1.6.9 1.2l-3.8 14.6c-.2.5-.7.9-1.2.9H1.3c-.7 0-1.1-.6-.9-1.2L4.2 4.4c.2-.5.7-.9 1.2-.9Z"/>` +
      `<path stroke="${hole}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="m7.6 7.8 4.4 3.7-5.6 3.9M12.6 15.6h4.3"/>`;
  throw new Error(kind);
}

const STACK = [
  { group: "game", items: [["Unity", "si:unity"], ["C#", "csharp"]] },
  { group: "web", items: [["TypeScript", "si:typescript"], ["Next.js", "si:nextdotjs"], ["Tailwind CSS", "si:tailwindcss"], ["Vercel", "si:vercel"]] },
  { group: "mobile", items: [["Flutter", "si:flutter"], ["Dart", "si:dart"]] },
  { group: "data & tooling", items: [["Supabase", "si:supabase"], ["PostgreSQL", "si:postgresql"], ["Python", "si:python"], ["PowerShell", "powershell"], ["Git", "si:git"]] },
];

// ------------------------------------------------------------------ hero
function typingTimeline(words) {
  const rhythm = [82, 64, 96, 71, 88, 59, 77, 92]; // ms per keystroke, uneven like a hand
  const DEL = 36, HOLD = 1900, GAP = 380, LEAD = 260;
  let t = LEAD;
  const idle = [[0, LEAD]];
  const chars = []; // {w, k, ch, on, off}
  const moves = [[0, 0]]; // [time, column]
  let ki = 0;
  words.forEach((word, w) => {
    const mine = [];
    [...word].forEach((ch, k) => {
      t += rhythm[ki++ % rhythm.length];
      mine.push({ w, k, ch, on: t, off: 0 });
      moves.push([t, k + 1]);
    });
    idle.push([t, t + HOLD]);
    t += HOLD;
    for (let k = word.length - 1; k >= 0; k--) {
      t += DEL;
      mine[k].off = t;
      moves.push([t, k]);
    }
    idle.push([t, t + GAP]);
    t += GAP;
    chars.push(...mine);
  });
  return { total: t, chars, moves, idle };
}

function hero(th) {
  const W = 830, H = 300, BAR = 30;
  const cw = 15.6; // 26px monospace advance
  const x0 = 44, typeY = 234;
  const wordX = x0 + 11 * cw;
  const words = ["games", "web apps", "mobile apps", "AI tools"];
  const tl = typingTimeline(words);
  const P = (ms) => `${r3((ms / tl.total) * 100)}%`;
  const DELAY = 1000;

  const css = [];
  const chars = tl.chars
    .filter((c) => c.ch !== " ")
    .map((c, i) => {
      css.push(`@keyframes c${i}{0%{opacity:0}${P(c.on)}{opacity:1}${P(c.off)}{opacity:0}100%{opacity:0}}.c${i}{animation-name:c${i}}`);
      return `<text class="ch c${i}" x="${r3(wordX + c.k * cw)}" y="${typeY}">${esc(c.ch)}</text>`;
    });
  css.push(`@keyframes cur{${tl.moves.map(([t, col]) => `${P(t)}{transform:translateX(${r3(col * cw)}px)}`).join("")}100%{transform:translateX(0)}}`);
  // blink only while idle, solid while typing
  const blink = ["0%{opacity:1}"];
  for (const [a, b] of tl.idle) {
    let on = true;
    for (let t = a; t < b; t += 530) {
      blink.push(`${P(t)}{opacity:${on ? 1 : 0}}`);
      on = !on;
    }
    blink.push(`${P(b)}{opacity:1}`);
  }
  css.push(`@keyframes blink{${blink.join("")}100%{opacity:1}}`);

  // magnified contribution cells: 2x github geometry (22px cell, 8px gap, 4px radius)
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = 10, rows = 7, cell = 22, pitch = 30;
  const fx = W - 40 - (cols * pitch - 8), fy = Math.round((H - BAR - (rows * pitch - 8)) / 2);
  const cells = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const s = rand() * 0.62 + (c / (cols - 1)) * 0.5 - Math.abs(r - 3) * 0.035;
      const lv = s < 0.36 ? 0 : s < 0.55 ? 1 : s < 0.7 ? 2 : s < 0.84 ? 3 : 4;
      const anim = lv ? ` class="bz" style="animation-delay:${r3(-(c * 0.21 + r * 0.13))}s"` : "";
      cells.push(`<rect${anim} x="${fx + c * pitch}" y="${fy + r * pitch}" width="${cell}" height="${cell}" rx="4" fill="${th.levels[lv]}"/>`);
    }

  const style = `
text{font-family:${MONO}}
.in{animation:in .9s ${EASE} both}
.d1{animation-delay:.08s}.d2{animation-delay:.16s}.d3{animation-delay:.24s}.d4{animation-delay:.5s}
@keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.fade{animation:fade 1.4s ease-out both}@keyframes fade{from{opacity:0}to{opacity:1}}
.bz{animation:bz 5.2s ease-in-out infinite}@keyframes bz{0%,100%{opacity:1}50%{opacity:.42}}
.ch,.cur,.blink{animation-duration:${r3(tl.total)}ms;animation-iteration-count:infinite;animation-delay:${DELAY}ms;animation-fill-mode:both;animation-timing-function:step-end}
.cur{animation-name:cur}.blink{animation-name:blink}
.static{display:none}
@media (prefers-reduced-motion:reduce){.static{display:inline}.typed{display:none}}
${css.join("\n")}`;

  const body = `<defs>
<clipPath id="win"><rect width="${W}" height="${H}" rx="12"/></clipPath>
<linearGradient id="fadeL" x1="${fx}" x2="${fx + 150}" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="m"><rect x="${fx}" y="0" width="${W - fx}" height="${H}" fill="url(#fadeL)"/></mask>
<radialGradient id="glow" cx="${fx + 200}" cy="${fy + 90}" r="300" gradientUnits="userSpaceOnUse"><stop stop-color="${th.levels[4]}" stop-opacity="${th.glow}"/><stop offset="1" stop-color="${th.levels[4]}" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#win)">
<rect width="${W}" height="${H}" fill="${th.bg}"/>
<rect width="${W}" height="${H - BAR}" fill="url(#glow)"/>
<g mask="url(#m)" opacity="${th.field}"><g class="fade">${cells.join("")}</g></g>
<rect y="${H - BAR}" width="${W}" height="${BAR}" fill="${th.inset}"/>
<path d="M0 ${H - BAR + 0.5}H${W}" stroke="${th.border}"/>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="11.5" stroke="${th.border}"/>

<text class="in" x="${x0}" y="72" font-size="17" fill="${th.muted}"><tspan fill="${th.green}">$</tspan> whoami</text>
<text class="in d1" x="${x0 - 3}" y="140" font-family='${SANS}' font-size="64" font-weight="700" letter-spacing="-2" fill="${th.fg}" style='font-family:${SANS}'>Emin Karaman</text>
<text class="in d2" x="${x0}" y="180" font-size="20" fill="${th.muted}">Computer Engineer — Unity 3D &amp; C#</text>
<g class="in d3" font-size="26">
<text x="${x0}" y="${typeY}" fill="${th.fg}" textLength="${r3(10 * cw)}" lengthAdjust="spacing"><tspan fill="${th.green}">›</tspan> building</text>
<g class="typed" fill="${th.green}" font-weight="600">${chars.join("")}
<g class="cur"><rect class="blink" x="${r3(wordX + 1)}" y="${typeY - 21}" width="13.5" height="27" rx="1.5" fill="${th.amber}"/></g></g>
<text class="static" x="${wordX}" y="${typeY}" fill="${th.green}" font-weight="600">games, apps, AI tools</text>
</g>

<g class="in d4" font-size="12.5" fill="${th.muted}">
<path transform="translate(20 ${H - 23}) scale(.9)" fill="${th.muted}" d="${OCT.branch}"/>
<text x="40" y="${H - 10.5}">main</text>
<text x="96" y="${H - 10.5}" fill="${th.subtle}">C# · Dart · TypeScript · Python</text>
<circle cx="${W - 132}" cy="${H - 15}" r="3.5" fill="${th.levels[3]}"/>
<text x="${W - 20}" y="${H - 10.5}" text-anchor="end">emiinnkrmn.app</text>
</g>`;

  return svg({
    w: W, h: H, style, body,
    title: "Emin Karaman — Computer Engineer",
    desc: "Emin Karaman, Computer Engineer and Unity 3D & C# developer, building games, web apps, mobile apps and AI tools. Portfolio: emiinnkrmn.app",
  });
}

// ------------------------------------------------------------------ portfolio pill
function pill(th) {
  const W = 300, H = 42;
  const style = `
text{font-family:${MONO};font-size:14.5px}
.ring{transform-box:fill-box;transform-origin:center;animation:ring 2.4s ${EASE} infinite}
@keyframes ring{0%{transform:scale(.6);opacity:.9}70%,100%{transform:scale(2.4);opacity:0}}`;
  const body = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" fill="${th.inset}" stroke="${th.border}"/>
<circle class="ring" cx="22" cy="21" r="4" fill="${th.levels[3]}"/>
<circle cx="22" cy="21" r="4" fill="${th.levels[3]}"/>
<text x="38" y="26" fill="${th.muted}">portfolio</text>
<path d="M126 13v16" stroke="${th.border}"/>
<text x="140" y="26" fill="${th.fg}">emiinnkrmn.app</text>
<path d="M270 26.5 278.5 18M272 18h6.5v6.5" stroke="${th.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg({ w: W, h: H, style, body, title: "Portfolio: emiinnkrmn.app", desc: "Link to Emin Karaman's portfolio website, emiinnkrmn.app" });
}

// ------------------------------------------------------------------ stack (two halves, 2 columns each)
function stackHalf(th, groups, icons) {
  const W = 410, ROW = 32, TOP = 58;
  const rows = Math.max(...STACK.map((g) => g.items.length)); // same height for both halves
  const H = TOP + rows * ROW;
  const colW = 205;
  const out = [];
  groups.forEach((g, gi) => {
    const x = gi * colW + 4;
    out.push("<g>");
    out.push(`<rect x="${x}" y="14" width="11" height="11" rx="2" fill="${th.levels[4]}"/>`);
    out.push(`<text x="${x + 20}" y="24" font-size="15" font-weight="600" fill="${th.fg}">${esc(g.group)}<tspan fill="${th.subtle}">/</tspan></text>`);
    const last = TOP + (g.items.length - 1) * ROW;
    out.push(`<path d="M${x + 5.5} 32V${last}" stroke="${th.border}"/>`);
    g.items.forEach(([name, key], i) => {
      const y = TOP + i * ROW;
      const corner = i === g.items.length - 1;
      out.push(
        corner
          ? `<path d="M${x + 5.5} ${y - 6}v2a4 4 0 0 0 4 4h8" stroke="${th.border}"/>`
          : `<path d="M${x + 5.5} ${y}h12" stroke="${th.border}"/>`,
      );
      const gx = x + 26, gy = y - 10, s = 20 / 24;
      const glyph = key.startsWith("si:")
        ? `<path fill="${th.muted}" d="${icons[key]}"/>`
        : drawnGlyph(key)(th.muted, th.bg);
      out.push(`<g transform="translate(${gx} ${gy}) scale(${r3(s)})">${glyph}</g>`);
      out.push(`<text x="${gx + 30}" y="${y + 5}" font-size="14.5" fill="${th.fg}">${esc(name)}</text>`);
    });
    out.push("</g>");
  });
  const style = `text{font-family:${MONO}}`;
  const names = groups.map((g) => `${g.group}: ${g.items.map((i) => i[0]).join(", ")}`).join("; ");
  return svg({ w: W, h: H, style, body: out.join("\n"), title: `Stack — ${groups.map((g) => g.group).join(" and ")}`, desc: names });
}

// ------------------------------------------------------------------ project cards
const PROJECTS = [
  {
    file: "project-video-factory",
    name: "youtube-video-otomasyon",
    lines: ["AI video production & marketing factory:", "scripts, voice-over, dynamic subtitles,", "9:16 renders and auto-publishing."],
    lang: "Python",
  },
  {
    file: "project-portfolio",
    name: "PORTFOL-O",
    lines: ["Source of emiinnkrmn.app, my personal", "portfolio site."],
    lang: "HTML",
  },
];

function projectCard(th, p) {
  const W = 410, H = 156;
  const style = "";
  const body = `<g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${th.bg}" stroke="${th.border}"/>
<path transform="translate(20 21)" fill="${th.muted}" d="${OCT.repo}"/>
<text x="44" y="34" font-family='${SANS}' font-size="16" font-weight="600" fill="${th.fg}">${esc(p.name)}</text>
<rect x="${W - 70.5}" y="19.5" width="50" height="19" rx="9.5" stroke="${th.border}"/>
<text x="${W - 45.5}" y="33" font-family='${SANS}' font-size="11.5" font-weight="500" fill="${th.muted}" text-anchor="middle">Public</text>
${p.lines.map((l, k) => `<text x="20" y="${66 + k * 21}" font-family='${SANS}' font-size="14" fill="${th.muted}">${esc(l)}</text>`).join("\n")}
<rect x="20" y="${H - 32}" width="11" height="11" rx="2" fill="${th.levels[3]}"/>
<text x="38" y="${H - 22}" font-family='${MONO}' font-size="13" fill="${th.muted}">${esc(p.lang)}</text>
<path d="M${W - 34} ${H - 20} ${W - 25} ${H - 29}M${W - 32} ${H - 29}h7v7" stroke="${th.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;
  return svg({ w: W, h: H, style, body, title: `${p.name} — public repository`, desc: `${p.lines.join(" ")} Language: ${p.lang}.` });
}

// ------------------------------------------------------------------ main
async function main() {
  const icons = {};
  for (const g of STACK)
    for (const [, key] of g.items) if (key.startsWith("si:")) icons[key] = await simpleIcon(key.slice(3));

  await mkdir(OUT, { recursive: true });
  const files = [];
  for (const [name, th] of Object.entries(THEMES)) {
    files.push([`hero-${name}.svg`, hero(th)]);
    files.push([`portfolio-${name}.svg`, pill(th)]);
    files.push([`stack-a-${name}.svg`, stackHalf(th, STACK.slice(0, 2), icons)]);
    files.push([`stack-b-${name}.svg`, stackHalf(th, STACK.slice(2), icons)]);
    PROJECTS.forEach((p) => files.push([`${p.file}-${name}.svg`, projectCard(th, p)]));
  }
  for (const [f, content] of files) {
    await writeFile(join(OUT, f), content);
    console.log(`${f.padEnd(34)} ${(content.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
