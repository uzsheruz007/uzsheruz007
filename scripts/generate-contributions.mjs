// Generates assets/contributions.svg from the public contribution calendar.
// Usage: node scripts/generate-contributions.mjs [username]
import { writeFileSync, mkdirSync } from "node:fs";

const user = process.argv[2] ?? "uzsheruz007";
const COLORS = ["#161b22", "#0b3a63", "#1256a8", "#1f6feb", "#22d3ee"];
const CELL = 12, GAP = 4, STEP = CELL + GAP;
const LEFT = 44, TOP = 96, W = 940;

// With GITHUB_TOKEN (read:user) the GraphQL API also counts private contributions.
// Without it, the public calendar is used and private work is not included.
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const days = [];

async function fromGraphQL(token) {
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
    weeks { contributionDays { date contributionCount contributionLevel } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  if (!res.ok) throw new Error(`GraphQL responded ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  for (const w of json.data.user.contributionsCollection.contributionCalendar.weeks) {
    for (const d of w.contributionDays) {
      days.push({ date: d.date, level: LEVELS[d.contributionLevel] ?? 0, count: d.contributionCount });
    }
  }
}

async function fromPublicCalendar() {
  const res = await fetch(`https://github.com/users/${user}/contributions`);
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const html = await res.text();
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/tool-tip>/g)) {
    const n = m[2].match(/^(No|\d+)\s+contribution/);
    if (n) counts.set(m[1], n[1] === "No" ? 0 : Number(n[1]));
  }
  for (const m of html.matchAll(/<td[^>]*>/g)) {
    const tag = m[0];
    const date = tag.match(/data-date="([^"]+)"/)?.[1];
    const id = tag.match(/id="([^"]+)"/)?.[1];
    const level = tag.match(/data-level="(\d)"/)?.[1];
    if (date && id && level !== undefined) {
      days.push({ date, level: Number(level), count: counts.get(id) ?? 0 });
    }
  }
}

if (process.env.GITHUB_TOKEN) await fromGraphQL(process.env.GITHUB_TOKEN);
else await fromPublicCalendar();
if (days.length === 0) throw new Error("No contribution cells found");
days.sort((a, b) => a.date.localeCompare(b.date));

const utc = (d) => new Date(`${d}T00:00:00Z`);
const first = utc(days[0].date);
const firstSunday = new Date(first.getTime() - first.getUTCDay() * 86400000);
const weekOf = (d) => Math.floor((utc(d) - firstSunday) / (7 * 86400000));

const total = days.reduce((s, d) => s + d.count, 0);
const active = days.filter((d) => d.count > 0).length;
const best = days.reduce((a, b) => (b.count > a.count ? b : a));
let streak = 0, longest = 0;
for (const d of days) { streak = d.count > 0 ? streak + 1 : 0; longest = Math.max(longest, streak); }

const weeks = weekOf(days[days.length - 1].date) + 1;
const H = TOP + 7 * STEP + 62;
const gridW = weeks * STEP;
const scale = Math.min(1, (W - LEFT - 24) / gridW);

const months = [];
let lastMonth = -1;
for (const d of days) {
  const dt = utc(d.date);
  const mo = dt.getUTCMonth();
  if (mo !== lastMonth && dt.getUTCDate() <= 7) {
    months.push({ x: weekOf(d.date) * STEP, label: dt.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
    lastMonth = mo;
  }
}

const cells = days.map((d) => {
  const x = weekOf(d.date) * STEP;
  const y = utc(d.date).getUTCDay() * STEP;
  const delay = (weekOf(d.date) * 0.018).toFixed(3);
  const glow = d.level === 4 ? ' filter="url(#glow)"' : "";
  return `<rect class="c" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${COLORS[d.level]}"${glow} style="animation-delay:${delay}s"><title>${d.count} contribution${d.count === 1 ? "" : "s"} on ${d.date}</title></rect>`;
}).join("\n      ");

const monthText = months.map((m) => `<text x="${m.x}" y="-10" class="lbl">${m.label}</text>`).join("");
const dayLbl = ["Mon", "Wed", "Fri"].map((t, i) => `<text x="-12" y="${(i * 2 + 1) * STEP + 10}" class="lbl" text-anchor="end">${t}</text>`).join("");

const stat = (x, value, label) =>
  `<g transform="translate(${x} 0)"><text class="num" y="0">${value}</text><text class="lbl" y="18">${label}</text></g>`;

const legendX = W - 24 - (COLORS.length * STEP + 74);
const legend = COLORS.map((c, i) => `<rect x="${legendX + 32 + i * STEP}" y="-10" width="${CELL}" height="${CELL}" rx="3" fill="${c}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${total} contributions in the last year">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#0b1b30"/>
    </linearGradient>
    <linearGradient id="ttl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#1f6feb"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    text { font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; }
    .ttl { font-size: 22px; font-weight: 700; fill: url(#ttl); }
    .sub { font-size: 13px; fill: #8b949e; }
    .num { font-size: 20px; font-weight: 700; fill: #e6edf3; }
    .lbl { font-size: 11px; fill: #8b949e; }
    .c { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pop .5s ease-out forwards; }
    @keyframes pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { .c { animation: none; opacity: 1; } }
  </style>
  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)" stroke="#1f6feb" stroke-opacity=".35"/>
  <text x="24" y="38" class="ttl">${total} contributions</text>
  <text x="24" y="58" class="sub">in the last year · @${user}</text>
  <g transform="translate(${W - 24 - 3 * 150} 34)" text-anchor="start">
    ${stat(0, active, "active days")}
    ${stat(150, longest, "longest streak")}
    ${stat(300, best.count, "best day")}
  </g>
  <g transform="translate(${LEFT} ${TOP})">
    <g transform="scale(${scale})">
      ${monthText}
      ${dayLbl}
      ${cells}
    </g>
  </g>
  <g transform="translate(0 ${H - 22})">
    <text x="${legendX}" y="0" class="lbl">Less</text>
    ${legend}
    <text x="${legendX + 32 + COLORS.length * STEP + 4}" y="0" class="lbl">More</text>
  </g>
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/contributions.svg", svg);
console.log(`assets/contributions.svg: ${total} contributions, ${active} active days, longest streak ${longest}, ${weeks} weeks`);
