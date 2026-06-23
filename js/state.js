// Stockage local + helpers de dates et de série.
const KEY = "almanach.v1";

const DEFAULT = {
  profile: null,        // { blasonId, createdAt }
  days: {},             // { 'YYYY-MM-DD': { format: { itemId, status, ... } } }
  puzzleStreak: 0,
  puzzleLastDay: null,  // dernier jour où au moins un jeu a été réussi
  puzzleSolved: 0,
  puzzlePlayed: 0,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return Object.assign(structuredClone(DEFAULT), JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT);
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function getState() { return state; }

export function update(fn) {
  fn(state);
  persist();
  return state;
}

export function setProfile(blasonId) {
  update((s) => { s.profile = { blasonId, createdAt: new Date().toISOString() }; });
}

// ---------- Dates ----------
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function epochDay(key) {
  const d = new Date(`${key}T00:00:00`);
  return Math.floor(d.getTime() / 86400000);
}

export function yesterdayKey(key) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// Choix déterministe d'un item dans une banque, pour un jour donné.
export function pickItem(bank, key) {
  if (!bank || !bank.length) return null;
  return bank[Math.abs(epochDay(key)) % bank.length];
}

// ---------- Jeux du jour ----------
export function dayRecords(key) {
  return state.days[key] || {};
}

// Enregistre le résultat d'un jeu (un seul par type et par jour).
export function recordPuzzle(key, format, record, solved) {
  update((s) => {
    const day = s.days[key] || (s.days[key] = {});
    const hadSolveToday = Object.values(day).some((r) => r.status === "solved");
    day[format] = record;
    s.puzzlePlayed += 1;
    if (solved) s.puzzleSolved += 1;

    // Série « indulgente » : un jour compte dès le premier jeu réussi.
    if (solved && !hadSolveToday) {
      if (s.puzzleLastDay === yesterdayKey(key)) s.puzzleStreak += 1;
      else if (s.puzzleLastDay !== key) s.puzzleStreak = 1;
      s.puzzleLastDay = key;
    }
  });
}

// Progression du jour : combien de jeux joués sur le total.
export function dailyProgress(key, formatKeys) {
  const day = dayRecords(key);
  const done = formatKeys.filter((f) => day[f]).length;
  return { done, total: formatKeys.length };
}

// Une série n'est « vivante » que si elle a été alimentée aujourd'hui ou hier.
export function liveStreak(key) {
  if (state.puzzleLastDay === key || state.puzzleLastDay === yesterdayKey(key)) return state.puzzleStreak;
  return 0;
}
