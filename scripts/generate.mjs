// Generates themed SVG cards (stats, languages, activity, featured repos) into dist/.
// Runs in GitHub Actions — no external services, no dependencies (Node 20+).
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "JustGenios12127";
const TOKEN = process.env.GITHUB_TOKEN;
const FEATURED = (process.env.FEATURED || "Pomidor,luckyapp,lucky-backend,searchworker").split(",");
const OUT = "dist";

const C = {
  bg: "#0d1117",
  border: "#2a2418",
  track: "#21262d",
  gold: "#d4b483",
  light: "#f5e6c8",
  text: "#c9d1d9",
  muted: "#8b949e",
};
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-cards" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const { user } = await gql(
  `query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: { field: STARGAZERS, direction: DESC }) {
        totalCount
        nodes {
          name description stargazerCount forkCount
          primaryLanguage { name color }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
        }
      }
      contributionsCollection {
        totalCommitContributions restrictedContributionsCount
        contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } }
      }
    }
  }`,
  { login: USER },
);

const repos = user.repositories.nodes;
const cc = user.contributionsCollection;

// ─── shared frame ───────────────────────────────────────────────────────────
function frame(w, h, title, kanji, body, css = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
<style>
  text { font-family: ${FONT}; }
  .fade { opacity: 0; animation: fade .7s ease forwards; }
  @keyframes fade { to { opacity: 1; } }
  ${css}
</style>
<defs>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.gold}" stop-opacity="0"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="${C.bg}" stroke="${C.border}"/>
<rect x="40" y="0" width="${w - 80}" height="1.5" fill="url(#edge)"/>
${title ? `<text x="24" y="38" font-size="16" font-weight="700" letter-spacing="1.5" fill="${C.gold}">${esc(title)}</text>` : ""}
${kanji ? `<text x="${w - 24}" y="38" text-anchor="end" font-size="15" fill="${C.muted}" opacity=".6" font-family="'Yu Mincho','MS Mincho','Noto Serif CJK JP',serif">${kanji}</text>` : ""}
${body}
</svg>`;
}

// ─── stats card ─────────────────────────────────────────────────────────────
function statsCard() {
  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const total = cc.contributionCalendar.totalContributions;
  const rows = [
    ["★", "Total stars", stars],
    ["◆", "Commits (last year)", cc.totalCommitContributions + cc.restrictedContributionsCount],
    ["⇄", "Pull requests", user.pullRequests.totalCount],
    ["●", "Issues", user.issues.totalCount],
    ["▣", "Public repos", user.repositories.totalCount],
  ];
  const body = rows
    .map(
      ([icon, label, value], i) => `<g class="fade" style="animation-delay:${150 + i * 120}ms">
  <text x="28" y="${84 + i * 27}" font-size="13" fill="${C.gold}">${icon}</text>
  <text x="50" y="${84 + i * 27}" font-size="14" fill="${C.text}">${label}</text>
  <text x="290" y="${84 + i * 27}" text-anchor="end" font-size="14" font-weight="700" fill="${C.light}">${fmt(value)}</text>
</g>`,
    )
    .join("\n");

  const goal = Math.max(100, Math.ceil((total + 1) / 500) * 500);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - total / goal);
  const ring = `<g transform="translate(395 118)">
  <circle r="${r}" stroke="${C.track}" stroke-width="8"/>
  <circle r="${r}" stroke="${C.gold}" stroke-width="8" stroke-linecap="round" transform="rotate(-90)"
    stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" class="ring"/>
  <text y="6" text-anchor="middle" font-size="26" font-weight="800" fill="${C.light}" class="fade" style="animation-delay:600ms">${fmt(total)}</text>
  <text y="26" text-anchor="middle" font-size="11" letter-spacing="1" fill="${C.muted}">CONTRIBS</text>
  <text y="${r + 26}" text-anchor="middle" font-size="11" fill="${C.muted}">next goal · ${fmt(goal)}</text>
</g>`;
  const css = `.ring { animation: ring 1.4s cubic-bezier(.2,.8,.2,1) forwards; stroke-dashoffset: ${circ.toFixed(1)}; }
  @keyframes ring { to { stroke-dashoffset: ${offset.toFixed(1)}; } }`;
  return frame(495, 210, "STATS", "統計", body + ring, css);
}

// ─── languages card ─────────────────────────────────────────────────────────
function langsCard() {
  const map = new Map();
  for (const r of repos)
    for (const e of r.languages.edges) {
      const cur = map.get(e.node.name) || { size: 0, color: e.node.color || C.muted };
      cur.size += e.size;
      map.set(e.node.name, cur);
    }
  const all = [...map.entries()].sort((a, b) => b[1].size - a[1].size);
  const top = all.slice(0, 8);
  const sum = top.reduce((a, [, v]) => a + v.size, 0) || 1;

  const barW = 447;
  let x = 0;
  const segs = top
    .map(([, v]) => {
      const w = (v.size / sum) * barW;
      const s = `<rect x="${x.toFixed(2)}" width="${Math.max(w, 0).toFixed(2)}" height="10" fill="${v.color}"/>`;
      x += w;
      return s;
    })
    .join("");
  const list = top
    .map(([name, v], i) => {
      const cx = i < 4 ? 28 : 262;
      const cy = 100 + (i % 4) * 26;
      return `<g class="fade" style="animation-delay:${200 + i * 90}ms">
  <circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${v.color}"/>
  <text x="${cx + 18}" y="${cy}" font-size="14" fill="${C.text}">${esc(name)}</text>
  <text x="${cx + 205}" y="${cy}" text-anchor="end" font-size="13" fill="${C.muted}">${((v.size / sum) * 100).toFixed(1)}%</text>
</g>`;
    })
    .join("\n");
  const body = `<clipPath id="bar"><rect width="${barW}" height="10" rx="5"/></clipPath>
<g transform="translate(24 58)"><g clip-path="url(#bar)"><rect width="${barW}" height="10" fill="${C.track}"/><g class="grow">${segs}</g></g></g>
${list}`;
  const css = `.grow { transform: scaleX(0); animation: growx 1.1s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes growx { to { transform: scaleX(1); } }`;
  return frame(495, 210, "LANGUAGES", "言語", body, css);
}

// ─── activity card ──────────────────────────────────────────────────────────
function activityCard() {
  const weeks = cc.contributionCalendar.weeks.map((w) => ({
    date: w.contributionDays[0].date,
    count: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
  }));
  const W = 990, H = 250;
  const left = 32, right = W - 24, top = 64, bottom = 200;
  const slot = (right - left) / weeks.length;
  const bw = Math.max(slot - 4, 3);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const best = Math.max(...weeks.map((w) => w.count));
  const total = cc.contributionCalendar.totalContributions;

  const grid = [0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="${left}" x2="${right}" y1="${bottom - (bottom - top) * f}" y2="${bottom - (bottom - top) * f}" stroke="${C.track}" stroke-dasharray="3 5"/>`)
    .join("");
  const bars = weeks
    .map((w, i) => {
      const h = w.count ? Math.max(3, ((bottom - top) * w.count) / max) : 2;
      const fill = w.count ? "url(#barfill)" : C.track;
      return `<rect class="bar" style="animation-delay:${i * 18}ms" x="${(left + i * slot + (slot - bw) / 2).toFixed(1)}" y="${(bottom - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"><title>${w.date}: ${w.count}</title></rect>`;
    })
    .join("\n");

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1, lastIdx = -10;
  const labels = weeks
    .map((w, i) => {
      const m = new Date(w.date).getUTCMonth();
      if (m === lastMonth || i - lastIdx < 3) return "";
      lastMonth = m;
      lastIdx = i;
      return `<text x="${(left + i * slot).toFixed(1)}" y="${bottom + 22}" font-size="11" fill="${C.muted}">${months[m]}</text>`;
    })
    .join("");

  const body = `<defs><linearGradient id="barfill" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${C.light}"/><stop offset=".35" stop-color="${C.gold}"/><stop offset="1" stop-color="#6b5530"/>
</linearGradient></defs>
<text x="${W - 24}" y="38" text-anchor="end" font-size="13" fill="${C.muted}"><tspan fill="${C.light}" font-weight="700">${fmt(total)}</tspan> contributions  ·  best week <tspan fill="${C.light}" font-weight="700">${best}</tspan>  ·  活動</text>
${grid}
${bars}
${labels}`;
  const css = `.bar { transform-box: fill-box; transform-origin: bottom; transform: scaleY(0); animation: grow .9s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes grow { to { transform: scaleY(1); } }`;
  return frame(W, H, "CONTRIBUTION PATH", "", body, css);
}

// ─── repo card ──────────────────────────────────────────────────────────────
function wrap(text, max, lines) {
  const words = text.split(/\s+/);
  const out = [""];
  for (const w of words) {
    const cur = out[out.length - 1];
    if ((cur + " " + w).trim().length <= max) out[out.length - 1] = (cur + " " + w).trim();
    else if (out.length < lines) out.push(w);
    else {
      out[out.length - 1] = cur.replace(/.{0,2}$/, "") + "…";
      break;
    }
  }
  return out;
}

const REPO_ICON =
  "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.25.25 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z";

function repoCard(r) {
  const desc = r.description ? wrap(r.description, 52, 2) : null;
  const lang = r.primaryLanguage;
  const descSvg = desc
    ? desc.map((l, i) => `<text x="24" y="${70 + i * 19}" font-size="13" fill="${C.muted}">${esc(l)}</text>`).join("")
    : `<text x="24" y="70" font-size="13" font-style="italic" fill="${C.muted}" opacity=".7">No description yet</text>`;
  let fx = 24;
  const foot = [];
  if (lang) {
    foot.push(`<circle cx="${fx + 5}" cy="113" r="5" fill="${lang.color || C.muted}"/><text x="${fx + 16}" y="117" font-size="12" fill="${C.text}">${esc(lang.name)}</text>`);
    fx += 30 + lang.name.length * 7.2;
  }
  foot.push(`<text x="${fx}" y="117" font-size="12" fill="${C.text}"><tspan fill="${C.gold}">★</tspan> ${fmt(r.stargazerCount)}</text>`);
  fx += 48;
  foot.push(`<text x="${fx}" y="117" font-size="12" fill="${C.text}"><tspan fill="${C.gold}">⑂</tspan> ${fmt(r.forkCount)}</text>`);

  const body = `<g class="fade">
<path d="${REPO_ICON}" fill="${C.gold}" transform="translate(24 20)"/>
<text x="48" y="34" font-size="17" font-weight="700" fill="${C.light}">${esc(r.name)}</text>
${descSvg}
${foot.join("\n")}
</g>`;
  return frame(400, 136, "", "", body);
}

// ─── write ──────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/stats.svg`, statsCard());
writeFileSync(`${OUT}/langs.svg`, langsCard());
writeFileSync(`${OUT}/activity.svg`, activityCard());
for (const name of FEATURED) {
  const r = repos.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!r) {
    console.warn(`repo not found: ${name}`);
    continue;
  }
  writeFileSync(`${OUT}/repo-${r.name}.svg`, repoCard(r));
}
console.log("cards generated:", FEATURED.length + 3);
