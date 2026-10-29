// Generates the profile's SVG cards (header, stats, languages) into ../assets.
// Counts private repositories too, but never prints private repo names.
// Usage: node scripts/generate.mjs   (needs `gh` logged in, or GITHUB_TOKEN set)
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = "ssefakeskin";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const TOKEN = process.env.GITHUB_TOKEN || execSync("gh auth token").toString().trim();

// Markup and styling languages are left out so they don't drown real code.
const SKIP_LANGS = new Set(["HTML", "CSS", "SCSS", "CMake", "RenderScript", "Ruby", "Swift", "Kotlin", "Objective-C", "Batchfile", "PowerShell", "Shell"]);
const LANG_COLORS = {
  Dart: "#00B4AB", TypeScript: "#3178C6", JavaScript: "#F1E05A", Python: "#3572A5",
  Luau: "#00A2FF", Lua: "#000080", Java: "#B07219", "C#": "#178600", "C++": "#F34B7D",
};

const gh = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (res.status === 409) return []; // empty repository
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const allPages = async (path) => {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace";
const ACCENT = "#22D3EE";
const ACCENT2 = "#818CF8";

// ---------- data ----------
const repos = (await allPages(`/user/repos?affiliation=owner`)).filter((r) => r.owner.login === USER);
let commits = 0;
const langBytes = {};
for (const repo of repos) {
  const list = await allPages(`/repos/${USER}/${repo.name}/commits?`);
  // Own commits everywhere, plus AI-assisted commits in my own (non-fork) repos. Teammates' commits never count.
  commits += list.filter((c) => c.author?.login === USER || (!repo.fork && c.commit.author.email === "noreply@anthropic.com")).length;
  if (repo.fork) continue; // a fork's code is mostly someone else's, so it stays out of the language mix
  for (const [lang, bytes] of Object.entries(await gh(`/repos/${USER}/${repo.name}/languages`))) {
    if (!SKIP_LANGS.has(lang)) langBytes[lang] = (langBytes[lang] || 0) + bytes;
  }
}
const langs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]);
const totalBytes = langs.reduce((s, [, b]) => s + b, 0);
const top = langs.filter(([, b]) => b / totalBytes >= 0.005).slice(0, 6).map(([name, b]) => ({ name, pct: (b / totalBytes) * 100 }));
const me = await gh(`/users/${USER}`);
const since = new Date(me.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const privateCount = repos.filter((r) => r.private).length;

// ---------- shared card frame ----------
const frame = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1220"/><stop offset="1" stop-color="#0D1117"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT2}"/></linearGradient>
  </defs>
  <style>
    .t{font:600 15px ${FONT};fill:#E6EDF3;letter-spacing:.3px}
    .l{font:400 13px ${FONT};fill:#8B949E}
    .v{font:700 24px ${FONT};fill:#F0F6FC}
    .m{font:500 12px ${MONO};fill:#8B949E}
    .fade{opacity:0;animation:in .6s ease forwards}
    @keyframes in{to{opacity:1}}
    @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  </style>
  <rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="url(#bg)" stroke="#21262D"/>
  <rect x="24" y="22" width="4" height="16" rx="2" fill="url(#ac)"/>
  <text x="36" y="35" class="t">${esc(title)}</text>
  ${body}
</svg>`;

// ---------- stats card ----------
const stats = [
  ["Commits", commits.toLocaleString("en-US")],
  ["Repositories", repos.length],
  ["Team projects", repos.filter((r) => r.fork).length],
  ["Languages", top.length],
];
const statsSvg = frame(420, 180, "Activity", stats.map(([label, value], i) => {
  const x = 24 + (i % 2) * 196, y = 60 + Math.floor(i / 2) * 56;
  return `<g class="fade" style="animation-delay:${i * 120}ms">
    <rect x="${x}" y="${y}" width="180" height="46" rx="10" fill="#161B22" stroke="#21262D"/>
    <text x="${x + 14}" y="${y + 29}" class="v">${esc(value)}</text>
    <text x="${x + 166}" y="${y + 28}" class="l" text-anchor="end">${esc(label)}</text>
  </g>`;
}).join("") + `<text x="396" y="35" class="m" text-anchor="end">since ${esc(since)}</text>`);

// ---------- languages card ----------
let cursor = 24;
const barW = 372;
const bar = top.map(({ name, pct }) => {
  const w = Math.max((pct / 100) * barW, 2);
  const seg = `<rect x="${cursor}" y="58" width="${w}" height="10" fill="${LANG_COLORS[name] || "#6E7681"}"/>`;
  cursor += w;
  return seg;
}).join("");
const legend = top.map(({ name, pct }, i) => {
  const x = 24 + (i % 2) * 196, y = 96 + Math.floor(i / 2) * 26;
  return `<g class="fade" style="animation-delay:${200 + i * 90}ms">
    <circle cx="${x + 6}" cy="${y - 4}" r="5" fill="${LANG_COLORS[name] || "#6E7681"}"/>
    <text x="${x + 18}" y="${y}" class="t" style="font-size:13px">${esc(name)}</text>
    <text x="${x + 180}" y="${y}" class="m" text-anchor="end">${pct.toFixed(1)}%</text>
  </g>`;
}).join("");
const langSvg = frame(420, 180, "Languages", `
  <clipPath id="clip"><rect x="24" y="58" width="${barW}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#clip)"><g style="transform-origin:24px 63px;animation:grow 1s cubic-bezier(.2,.8,.2,1) forwards">${bar}</g></g>
  ${legend}
  <text x="396" y="35" class="m" text-anchor="end">own repos · incl. private</text>`);

// ---------- header banner ----------
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320" viewBox="0 0 1200 320" role="img" aria-label="Sefa — Game &amp; Full-Stack Developer">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070B14"/><stop offset=".55" stop-color="#0B1324"/><stop offset="1" stop-color="#0D1117"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT2}"/></linearGradient>
    <radialGradient id="glowA" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${ACCENT}" stop-opacity=".35"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${ACCENT2}" stop-opacity=".3"/><stop offset="1" stop-color="${ACCENT2}" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#1B2433" stroke-width="1"/></pattern>
    <linearGradient id="gridFade" x1="0" y1="0" x2="1" y2="0"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>
    <mask id="gm"><rect width="1200" height="320" fill="url(#gridFade)"/></mask>
    <clipPath id="frame"><rect width="1200" height="320" rx="18"/></clipPath>
  </defs>
  <style>
    .name{font:800 92px ${FONT};fill:#F0F6FC;letter-spacing:-2px}
    .role{font:600 26px ${FONT};fill:url(#ac)}
    .tag{font:600 14px ${MONO};fill:#C9D1D9}
    .meta{font:500 14px ${MONO};fill:#6E7681}
    .drift{animation:drift 9s ease-in-out infinite alternate}
    .drift2{animation:drift 11s ease-in-out infinite alternate-reverse}
    .orbit{transform-origin:960px 160px;animation:spin 28s linear infinite}
    .orbit2{transform-origin:960px 160px;animation:spin 40s linear infinite reverse}
    .blink{animation:blink 1.1s steps(1) infinite}
    .rise{opacity:0;animation:rise .8s cubic-bezier(.2,.8,.2,1) forwards}
    @keyframes drift{to{transform:translate(-40px,18px)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes blink{50%{opacity:0}}
    @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  </style>
  <g clip-path="url(#frame)">
    <rect width="1200" height="320" fill="url(#bg)"/>
    <rect width="1200" height="320" fill="url(#grid)" mask="url(#gm)"/>
    <circle class="drift" cx="980" cy="120" r="260" fill="url(#glowA)"/>
    <circle class="drift2" cx="760" cy="300" r="220" fill="url(#glowB)"/>

    <!-- orbit motif: one core, many platforms -->
    <g opacity=".9">
      <circle cx="960" cy="160" r="110" fill="none" stroke="#22D3EE" stroke-opacity=".25" stroke-dasharray="2 8"/>
      <circle cx="960" cy="160" r="70" fill="none" stroke="#818CF8" stroke-opacity=".3"/>
      <g class="orbit"><circle cx="1070" cy="160" r="7" fill="${ACCENT}"/><circle cx="850" cy="160" r="4" fill="#E6EDF3" opacity=".6"/></g>
      <g class="orbit2"><circle cx="960" cy="90" r="6" fill="${ACCENT2}"/><circle cx="960" cy="230" r="3.5" fill="${ACCENT}" opacity=".7"/></g>
      <rect x="936" y="136" width="48" height="48" rx="12" fill="#0D1117" stroke="url(#ac)" stroke-width="2"/>
      <text x="960" y="168" text-anchor="middle" style="font:700 22px ${MONO};fill:url(#ac)">&lt;/&gt;</text>
    </g>

    <g class="rise">
      <text x="72" y="104" class="meta">~/ssefakeskin <tspan fill="${ACCENT}">❯</tspan> whoami<tspan class="blink" fill="${ACCENT}">▍</tspan></text>
    </g>
    <g class="rise" style="animation-delay:.12s"><text x="66" y="196" class="name">Sefa</text></g>
    <g class="rise" style="animation-delay:.24s"><text x="72" y="238" class="role">Game &amp; Full-Stack Developer</text></g>
    <g class="rise" style="animation-delay:.36s">
      ${["Roblox", "FiveM", "Flutter", "Next.js", "ROS 2"].map((t, i) => {
        const x = 72 + i * 112;
        return `<rect x="${x}" y="260" width="100" height="30" rx="15" fill="#111827" stroke="#263042"/><text x="${x + 50}" y="280" text-anchor="middle" class="tag">${t}</text>`;
      }).join("")}
    </g>
  </g>
  <rect x="1" y="1" width="1198" height="318" rx="18" fill="none" stroke="#1F2937"/>
</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "header.svg"), header);
writeFileSync(join(OUT, "stats.svg"), statsSvg);
writeFileSync(join(OUT, "languages.svg"), langSvg);
console.log({ commits, repos: repos.length, privateCount, languages: langs.length, top: top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`) });
