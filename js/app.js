// Point d'entrée : chargement des données, choix du blason, navigation, installation.
import { el, clear, crest } from "./util.js";
import {
  getState, setProfile, dayKey, pickItem,
  recordPuzzle, dayRecords, dailyProgress, liveStreak,
} from "./state.js";
import { FORMAT_TITLES, renderPuzzle } from "./puzzles.js";

const TODAY = dayKey();

// Les jeux proposés chaque jour, dans l'ordre d'affichage.
const FORMATS = [
  { key: "vraifaux", icon: "⚖️" },
  { key: "quisuisje", icon: "🕵️" },
  { key: "motdujour", icon: "🔤" },
  { key: "anagramme", icon: "🔀" },
  { key: "pendu", icon: "✍️" },
  { key: "definition", icon: "📖" },
  { key: "oeuvre", icon: "🖼️" },
];

let DATA = { blasons: [], puzzles: {} };
const $ = (sel) => document.querySelector(sel);

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function boot() {
  registerSW();
  try {
    const [blasons, puzzles] = await Promise.all([
      loadJSON("data/blasons.json"),
      loadJSON("data/puzzles.json"),
    ]);
    DATA = { blasons, puzzles };
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:serif;color:#2e2519">
      <h2>Oups…</h2><p>Impossible de charger les données du jeu.</p>
      <p style="color:#8a7a60;font-size:13px">${e.message}</p></div>`;
    return;
  }

  if (!getState().profile) showOnboarding();
  else showApp();
}

/* ---------------- Choix du blason ---------------- */
function showOnboarding() {
  const grid = $("#blasonGrid");
  clear(grid);
  for (const b of DATA.blasons) {
    grid.appendChild(el("button", { class: "club-btn", onClick: () => { setProfile(b.id); showApp(); } }, [
      crest(b.crest, b.color, "club-crest"),
      el("span", { text: b.name }),
    ]));
  }
  $("#onboarding").hidden = false;
  $("#app").hidden = true;
}

/* ---------------- App principale ---------------- */
function currentBlason() {
  const id = getState().profile?.blasonId;
  return DATA.blasons.find((b) => b.id === id) || DATA.blasons[0];
}

function showApp() {
  $("#onboarding").hidden = true;
  $("#app").hidden = false;

  const b = currentBlason();
  const logo = $("#appLogo");
  logo.textContent = b.crest;
  logo.style.cssText = `background:${b.color};color:#fff;border-radius:7px;width:28px;height:28px;display:inline-grid;place-items:center;font-size:15px`;

  setupTabs();
  refreshStreak();
  renderDailyHub();
  maybeInstallPrompt();
}

function refreshStreak() {
  $("#streakCount").textContent = String(liveStreak(TODAY));
}

function setupTabs() {
  const labels = { today: "Aujourd'hui", stats: "Mes statistiques" };
  document.querySelectorAll(".tabbtn").forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tabbtn").forEach((x) => x.classList.toggle("is-active", x === btn));
      ["today", "stats"].forEach((t) => { $(`#tab-${t}`).hidden = t !== tab; });
      $("#headerLabel").textContent = labels[tab];
      if (tab === "stats") renderStats($("#statsHost"));
      window.scrollTo(0, 0);
    };
  });
}

/* ---------------- Hub des jeux du jour ---------------- */
function renderProgress() {
  const host = $("#progressHost");
  clear(host);
  const { done, total } = dailyProgress(TODAY, FORMATS.map((f) => f.key));
  const pct = Math.round((done / total) * 100);
  const msg = done >= total ? "Bravo, journée complète ! 🎉" : `Encore ${total - done} jeu${total - done > 1 ? "x" : ""} à faire.`;
  host.appendChild(el("div", { class: "card progress-card" }, [
    el("div", { class: "progress-row" }, [el("strong", { text: "Aujourd'hui" }), el("span", { class: "progress-count", text: `${done}/${total}` })]),
    el("div", { class: "progress-bar" }, [el("div", { class: "progress-fill", style: `width:${pct}%` })]),
    el("div", { class: "progress-sub", text: msg }),
  ]));
}

function setBadge(badge, saved) {
  badge.className = "daily-badge";
  if (!saved) { badge.classList.add("todo"); badge.textContent = "À faire"; }
  else if (saved.status === "solved") { badge.classList.add("win"); badge.textContent = "Réussi ✓"; }
  else { badge.classList.add("lose"); badge.textContent = "Raté"; }
}

function renderDailyHub() {
  renderProgress();
  const host = $("#dailyHost");
  clear(host);
  for (const f of FORMATS) {
    const item = pickItem(DATA.puzzles[f.key], TODAY);
    const rec = dayRecords(TODAY)[f.key];
    const saved = rec && rec.itemId === item?.id ? rec : null;

    const card = el("div", { class: `daily-card${saved ? " done" : ""}` });
    const badge = el("span", { class: "daily-badge" });
    setBadge(badge, saved);
    const body = el("div", { class: "daily-body", hidden: true });
    const head = el("button", { class: "daily-head", onClick: () => toggleCard(card) }, [
      el("span", { class: "daily-icon", text: f.icon }),
      el("span", { class: "daily-title", text: FORMAT_TITLES[f.key] }),
      badge,
      el("span", { class: "chev", text: "▸" }),
    ]);
    card.append(head, body);
    card._ctx = { f, item, badge, saved };
    host.appendChild(card);
  }
}

function toggleCard(card) {
  const isOpen = card.classList.contains("open");
  document.querySelectorAll(".daily-card.open").forEach((c) => {
    c.classList.remove("open");
    c.querySelector(".daily-body").hidden = true;
  });
  if (isOpen) return;

  card.classList.add("open");
  const body = card.querySelector(".daily-body");
  body.hidden = false;

  if (!card.dataset.rendered) {
    const { f, item } = card._ctx;
    renderPuzzle(body, {
      key: TODAY, format: f.key, item, saved: card._ctx.saved,
      onComplete: (record, solved) => {
        const full = { itemId: item.id, ...record };
        recordPuzzle(TODAY, f.key, full, solved);
        card._ctx.saved = full;
        card.classList.add("done");
        setBadge(card._ctx.badge, full);
        refreshStreak();
        renderProgress();
      },
    });
    card.dataset.rendered = "1";
  }
}

/* ---------------- Mes statistiques ---------------- */
function renderStats(host) {
  clear(host);
  const s = getState();
  const streak = liveStreak(TODAY);
  const accuracy = s.puzzlePlayed ? Math.round((s.puzzleSolved / s.puzzlePlayed) * 100) : 0;
  const { done, total } = dailyProgress(TODAY, FORMATS.map((f) => f.key));

  const box = (num, cap) => el("div", { class: "stat-box" }, [
    el("div", { class: "stat-num", text: String(num) }),
    el("div", { class: "stat-cap", text: cap }),
  ]);

  host.appendChild(el("div", { class: "section-label", text: "Les jeux du jour" }));
  host.appendChild(el("div", { class: "stat-grid" }, [
    box(`${streak}🔥`, "Série en cours"),
    box(`${done}/${total}`, "Jeux du jour"),
    box(s.puzzleSolved, "Jeux réussis"),
    box(`${accuracy}%`, "Taux de réussite"),
  ]));

  host.appendChild(el("div", { class: "card" }, [
    el("div", { class: "card-eyebrow", text: "Partager" }),
    el("p", { class: "stat-cap", style: "text-align:left;margin-bottom:12px", text: "Montre tes scores à tes amis." }),
    el("button", { class: "btn-ghost share-btn", onClick: () => {
      const txt = `📜 L'Almanach\n🔥 Série : ${streak}\n🧠 Jeux réussis : ${s.puzzleSolved} (${accuracy}% de réussite)`;
      if (navigator.share) navigator.share({ text: txt }).catch(() => {});
      else { navigator.clipboard?.writeText(txt); alert("Score copié !\n\n" + txt); }
    } }, ["Partager mes scores"]),
  ]));
}

/* ---------------- Service worker ---------------- */
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}

/* ---------------- Invite d'installation ---------------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!getState().profile) return;
  showInstall("android");
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function maybeInstallPrompt() {
  if (isStandalone() || localStorage.getItem("almanach.install.dismissed")) return;
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (iOS) setTimeout(() => showInstall("ios"), 2500);
  else if (deferredPrompt) showInstall("android");
}

function showInstall(kind) {
  const box = $("#installPrompt");
  const steps = $("#installSteps");
  const btn = $("#installBtn");
  clear(steps);
  if (kind === "ios") {
    btn.hidden = true;
    steps.innerHTML = "Appuie sur le bouton <b>Partager</b> ⬆️, puis choisis <b>« Sur l'écran d'accueil »</b>.";
  } else {
    btn.hidden = false;
    steps.textContent = "";
    btn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      box.hidden = true;
    };
  }
  box.hidden = false;
}

$("#installClose").onclick = () => {
  $("#installPrompt").hidden = true;
  localStorage.setItem("almanach.install.dismissed", "1");
};

boot();
