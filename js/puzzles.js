// Les moteurs de jeu de L'Almanach.
import { el, clear, shuffle } from "./util.js";

export const FORMAT_TITLES = {
  vraifaux: "Vrai ou Faux",
  quisuisje: "Qui suis-je ?",
  motdujour: "Le Mot du jour",
  anagramme: "L'Anagramme",
  pendu: "Le Pendu",
  definition: "La Définition",
  oeuvre: "Devine l'œuvre",
};

// ctx = { key, format, item, saved, onComplete(record, solved) }
export function renderPuzzle(host, ctx) {
  clear(host);
  if (!ctx.item) {
    host.appendChild(el("p", { class: "vf-explain", text: "Aucun jeu disponible aujourd'hui. Reviens demain !" }));
    return;
  }
  const fn = {
    vraifaux: renderVraiFaux, quisuisje: renderQuiSuisJe, motdujour: renderWordle,
    anagramme: renderAnagramme, pendu: renderPendu, definition: renderDefinition, oeuvre: renderOeuvre,
  }[ctx.format];
  if (fn) fn(host, ctx);
}

function verdict(solved, text) {
  return el("div", { class: `vf-verdict ${solved ? "win" : "lose"}`, text });
}

// Bloc de réponses à choix multiple, partagé par plusieurs jeux.
function makeChoices(host, options, answer, saved, onComplete) {
  const buttons = [];
  const finish = (idx) => {
    const correct = options[idx] === answer;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (options[i] === answer) b.classList.add("correct");
      else if (i === idx) b.classList.add("wrong");
    });
    if (!saved) onComplete({ status: correct ? "solved" : "failed", chosenIndex: idx }, correct);
  };
  host.appendChild(el("div", { class: "options" }, options.map((name, i) => {
    const b = el("button", { class: "opt-btn", onClick: () => finish(i) }, [name]);
    buttons.push(b);
    return b;
  })));
  if (saved) finish(saved.chosenIndex);
}

/* ---------------- Vrai ou Faux ---------------- */
function renderVraiFaux(host, ctx) {
  const { item, saved } = ctx;
  host.appendChild(el("p", { class: "vf-statement", text: item.statement }));
  const explainBox = el("div", { class: "vf-explain", hidden: true });
  const finish = (chosen) => {
    const solved = chosen === item.answer;
    vrai.disabled = faux.disabled = true;
    (chosen ? vrai : faux).style.opacity = "1";
    (chosen ? faux : vrai).style.opacity = "0.45";
    explainBox.hidden = false;
    clear(explainBox);
    explainBox.appendChild(verdict(solved, solved ? "Bravo, c'est juste ! 🎉" : "Raté…"));
    explainBox.appendChild(el("div", { text: item.explain }));
    if (!saved) ctx.onComplete({ status: solved ? "solved" : "failed", chosen }, solved);
  };
  const vrai = el("button", { class: "vf-btn vrai", onClick: () => finish(true) }, ["VRAI"]);
  const faux = el("button", { class: "vf-btn faux", onClick: () => finish(false) }, ["FAUX"]);
  host.appendChild(el("div", { class: "vf-buttons" }, [vrai, faux]));
  host.appendChild(explainBox);
  if (saved) finish(saved.chosen);
}

/* ---------------- Qui suis-je ? ---------------- */
function renderQuiSuisJe(host, ctx) {
  const { item, saved } = ctx;
  host.appendChild(el("div", { class: "card-eyebrow", text: "Devine le personnage" }));
  const cluesBox = el("div", { class: "clues" });
  host.appendChild(cluesBox);
  let revealed = saved ? item.clues.length : 1;
  const moreBtn = el("button", { class: "btn-ghost clue-btn", onClick: () => { revealed = Math.min(item.clues.length, revealed + 1); paint(); } }, ["Indice suivant"]);
  function paint() {
    clear(cluesBox);
    item.clues.slice(0, revealed).forEach((c, i) => cluesBox.appendChild(
      el("div", { class: "clue" }, [el("span", { class: "clue-n", text: String(i + 1) }), el("span", { text: c })])
    ));
    moreBtn.hidden = revealed >= item.clues.length;
  }
  paint();
  host.appendChild(moreBtn);
  makeChoices(host, item.options, item.answer, saved, ctx.onComplete);
}

/* ---------------- La Définition ---------------- */
function renderDefinition(host, ctx) {
  host.appendChild(el("div", { class: "card-eyebrow", text: "De quel mot s'agit-il ?" }));
  host.appendChild(el("p", { class: "quiz-question", text: `« ${ctx.item.definition} »` }));
  makeChoices(host, ctx.item.options, ctx.item.answer, ctx.saved, ctx.onComplete);
}

/* ---------------- Devine l'œuvre ---------------- */
function renderOeuvre(host, ctx) {
  const { item } = ctx;
  const img = el("img", { class: "oeuvre-img", src: item.img, alt: "Œuvre à deviner", loading: "lazy" });
  img.addEventListener("error", () => { img.replaceWith(el("div", { class: "oeuvre-fallback", text: "🖼️ (image indisponible hors-ligne)" })); });
  host.appendChild(el("div", { class: "oeuvre-frame" }, [img]));
  host.appendChild(el("p", { class: "quiz-question", text: item.question }));
  makeChoices(host, item.options, item.answer, ctx.saved, ctx.onComplete);
}

/* ---------------- Clavier AZERTY partagé ---------------- */
const AZERTY = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];

/* ---------------- Le Mot du jour (Wordle) ---------------- */
const WORDLE_ROWS = ["AZERTYUIOP", "QSDFGHJKLM", "↵WXCVBN⌫"];
const MAX_TRIES = 6;

function scoreGuess(guess, answer) {
  const res = new Array(guess.length).fill("bad");
  const counts = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;
  for (let i = 0; i < guess.length; i++) if (guess[i] === answer[i]) { res[i] = "good"; counts[guess[i]]--; }
  for (let i = 0; i < guess.length; i++) {
    if (res[i] === "good") continue;
    if (counts[guess[i]] > 0) { res[i] = "close"; counts[guess[i]]--; }
  }
  return res;
}
function bestKey(prev, next) {
  const rank = { good: 3, close: 2, bad: 1 };
  if (!prev) return next;
  return rank[next] > rank[prev] ? next : prev;
}

function renderWordle(host, ctx) {
  const { item, saved } = ctx;
  const answer = item.answer.toUpperCase();
  const len = answer.length;
  const guesses = saved ? [...(saved.guesses || [])] : [];
  let current = "";
  let done = !!saved;

  host.appendChild(el("p", { class: "card-eyebrow", text: `Devine le mot · ${len} lettres` }));
  host.appendChild(el("p", { class: "vf-explain", text: `Indice : ${item.hint}` }));
  const grid = el("div", { class: "wordle-grid" });
  host.appendChild(grid);
  const keyState = {};
  const kb = el("div", { class: "wordle-keyboard" });
  host.appendChild(kb);
  const msg = el("div", { class: "vf-explain", hidden: true });
  host.appendChild(msg);

  function paintGrid() {
    clear(grid);
    for (let r = 0; r < MAX_TRIES; r++) {
      const row = el("div", { class: "wordle-row", style: `grid-template-columns: repeat(${len}, 1fr)` });
      const guess = guesses[r];
      for (let c = 0; c < len; c++) {
        let cls = "wordle-cell", ch = "";
        if (guess) {
          ch = guess[c];
          const res = scoreGuess(guess, answer)[c];
          cls += ` ${res}`;
          keyState[ch] = bestKey(keyState[ch], res);
        } else if (r === guesses.length) {
          ch = current[c] || "";
          if (ch) cls += " filled";
        }
        row.appendChild(el("div", { class: cls, text: ch }));
      }
      grid.appendChild(row);
    }
  }
  function paintKb() {
    clear(kb);
    for (const rowStr of WORDLE_ROWS) {
      const krow = el("div", { class: "wordle-krow" });
      for (const ch of rowStr) {
        const wide = ch === "↵" || ch === "⌫";
        const st = keyState[ch];
        krow.appendChild(el("button", { class: `key ${wide ? "wide" : ""} ${st || ""}`.trim(), onClick: () => onKey(ch) }, [ch]));
      }
      kb.appendChild(krow);
    }
  }
  function endGame(solved) {
    done = true;
    msg.hidden = false;
    clear(msg);
    msg.appendChild(verdict(solved, solved ? "Trouvé ! 🎉" : `Dommage… c'était ${answer}`));
    if (!ctx._restoring) ctx.onComplete({ status: solved ? "solved" : "failed", guesses }, solved);
  }
  function submit() {
    if (current.length !== len) { flash("Il manque des lettres."); return; }
    guesses.push(current);
    const solved = current === answer;
    current = "";
    paintGrid(); paintKb();
    if (solved) endGame(true);
    else if (guesses.length >= MAX_TRIES) endGame(false);
  }
  function flash(t) { msg.hidden = false; clear(msg); msg.appendChild(el("div", { text: t })); setTimeout(() => { if (!done) msg.hidden = true; }, 1200); }
  function onKey(ch) {
    if (done) return;
    if (ch === "⌫") { current = current.slice(0, -1); paintGrid(); }
    else if (ch === "↵") submit();
    else if (current.length < len) { current += ch; paintGrid(); }
  }
  document.addEventListener("keydown", (e) => {
    if (done || !host.isConnected) return;
    const k = e.key.toUpperCase();
    if (k === "ENTER") onKey("↵");
    else if (k === "BACKSPACE") onKey("⌫");
    else if (/^[A-Z]$/.test(k)) onKey(k);
  });

  if (saved) { ctx._restoring = true; paintGrid(); paintKb(); endGame(saved.status === "solved"); }
  else { paintGrid(); paintKb(); }
}

/* ---------------- L'Anagramme ---------------- */
function renderAnagramme(host, ctx) {
  const { item, saved } = ctx;
  const answer = item.answer.toUpperCase();
  host.appendChild(el("div", { class: "card-eyebrow", text: "Remets les lettres dans l'ordre" }));
  host.appendChild(el("p", { class: "vf-explain", text: `Indice : ${item.hint}` }));

  const slotRow = el("div", { class: "ana-slots" });
  const rackRow = el("div", { class: "ana-rack" });
  const msg = el("div", { class: "vf-explain", hidden: true });
  host.append(slotRow, rackRow, msg);

  if (saved) {
    // État restauré : on montre simplement la réponse et le verdict.
    for (const ch of answer) slotRow.appendChild(el("div", { class: "ana-slot filled", text: ch }));
    msg.hidden = false;
    msg.appendChild(verdict(saved.status === "solved", saved.status === "solved" ? "Bien joué ! 🎉" : `La réponse était ${answer}`));
    return;
  }

  let scrambled;
  do { scrambled = shuffle([...answer]); } while (scrambled.join("") === answer && answer.length > 1);

  const slots = answer.split("").map(() => ({ ch: null, el: null }));
  const rackTiles = scrambled.map((ch) => ({ ch, used: false, el: null }));
  let done = false;

  function paint() {
    clear(slotRow); clear(rackRow);
    slots.forEach((s, i) => {
      const node = el("div", { class: `ana-slot${s.ch ? " filled" : ""}`, onClick: () => { if (!done && s.ch) removeFromSlot(i); } }, [s.ch || ""]);
      s.el = node; slotRow.appendChild(node);
    });
    rackTiles.forEach((t, i) => {
      const node = el("button", { class: `ana-tile${t.used ? " used" : ""}`, disabled: t.used, onClick: () => { if (!done) placeTile(i); } }, [t.ch]);
      t.el = node; rackRow.appendChild(node);
    });
  }
  function placeTile(ri) {
    const slot = slots.find((s) => !s.ch);
    if (!slot) return;
    slot.ch = rackTiles[ri].ch; slot.from = ri; rackTiles[ri].used = true;
    paint();
    if (slots.every((s) => s.ch)) check();
  }
  function removeFromSlot(si) {
    const s = slots[si];
    if (s.from != null) rackTiles[s.from].used = false;
    s.ch = null; s.from = null;
    paint();
  }
  function check() {
    const word = slots.map((s) => s.ch).join("");
    if (word === answer) {
      done = true; paint();
      slots.forEach((s) => s.el.classList.add("good"));
      msg.hidden = false; msg.appendChild(verdict(true, "Bien joué ! 🎉"));
      ctx.onComplete({ status: "solved" }, true);
    } else {
      slotRow.classList.add("shake");
      setTimeout(() => { slotRow.classList.remove("shake"); slots.forEach((_, i) => removeFromSlot(i)); }, 600);
    }
  }
  const giveUp = el("button", { class: "btn-ghost clue-btn", onClick: () => {
    if (done) return;
    done = true;
    clear(slotRow);
    for (const ch of answer) slotRow.appendChild(el("div", { class: "ana-slot filled lose", text: ch }));
    clear(rackRow);
    msg.hidden = false; msg.appendChild(verdict(false, `La réponse était ${answer}`));
    ctx.onComplete({ status: "failed" }, false);
  } }, ["Voir la réponse"]);
  paint();
  host.appendChild(giveUp);
}

/* ---------------- Le Pendu ---------------- */
const PENDU_LIVES = 6;
function renderPendu(host, ctx) {
  const { item, saved } = ctx;
  const answer = item.answer.toUpperCase();
  host.appendChild(el("div", { class: "card-eyebrow", text: "Trouve le mot, lettre par lettre" }));
  host.appendChild(el("p", { class: "vf-explain", text: `Indice : ${item.hint}` }));

  const livesEl = el("div", { class: "pendu-lives" });
  const wordEl = el("div", { class: "pendu-word" });
  const kb = el("div", { class: "wordle-keyboard" });
  const msg = el("div", { class: "vf-explain", hidden: true });
  host.append(livesEl, wordEl, kb, msg);

  const guessed = new Set(saved ? saved.guessed || [] : []);
  let lives = PENDU_LIVES - [...guessed].filter((g) => !answer.includes(g)).length;
  let done = !!saved;

  const isLetter = (c) => /[A-Z]/.test(c);
  function won() { return [...answer].every((c) => !isLetter(c) || guessed.has(c)); }

  function paint() {
    clear(livesEl);
    for (let i = 0; i < PENDU_LIVES; i++) livesEl.appendChild(el("span", { class: `heart${i < lives ? "" : " lost"}`, text: "♥" }));
    clear(wordEl);
    for (const c of answer) {
      if (!isLetter(c)) { wordEl.appendChild(el("span", { class: "pendu-space", text: c === " " ? "" : c })); continue; }
      const shown = guessed.has(c) || (done && !won());
      wordEl.appendChild(el("span", { class: `pendu-letter${guessed.has(c) ? " found" : ""}`, text: shown ? c : "" }));
    }
    clear(kb);
    for (const rowStr of AZERTY) {
      const krow = el("div", { class: "wordle-krow" });
      for (const ch of rowStr) {
        let cls = "key";
        if (guessed.has(ch)) cls += answer.includes(ch) ? " good" : " bad";
        krow.appendChild(el("button", { class: cls, disabled: guessed.has(ch) || done, onClick: () => guess(ch) }, [ch]));
      }
      kb.appendChild(krow);
    }
  }
  function end(solved) {
    done = true; paint();
    msg.hidden = false; clear(msg);
    msg.appendChild(verdict(solved, solved ? "Trouvé ! 🎉" : `Perdu… c'était ${answer}`));
    if (!ctx._restoring) ctx.onComplete({ status: solved ? "solved" : "failed", guessed: [...guessed] }, solved);
  }
  function guess(ch) {
    if (done || guessed.has(ch)) return;
    guessed.add(ch);
    if (!answer.includes(ch)) lives--;
    if (won()) return end(true);
    if (lives <= 0) return end(false);
    paint();
  }
  document.addEventListener("keydown", (e) => {
    if (done || !host.isConnected) return;
    const k = e.key.toUpperCase();
    if (/^[A-Z]$/.test(k)) guess(k);
  });

  if (saved) { ctx._restoring = true; end(saved.status === "solved"); }
  else paint();
}
