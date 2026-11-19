import { firebaseConfig } from "./firebase-config.js";
import { firebaseStore, demoStore } from "./store.js";

const FISH_COLORS = {
  coral: "#ff8a5c", gold: "#ffc94a", sky: "#5cc8ff",
  bubblegum: "#ff7eb6", kelp: "#8be08b", grape: "#b79cff"
};
const SHELVES = {
  reading: { name: "In the Tank", hint: "Reading now", empty: "Nobody's mid-book. Suspicious." },
  read:    { name: "Fully Digested", hint: "Finished", empty: "No finished books yet. Get swimming." },
  want:    { name: "Bait Box", hint: "Want to read", empty: "The bait box is empty. Toss in something tempting." }
};

const state = {
  store: null, me: null, isAdmin: false,
  books: [], fish: {},
  shelf: "reading", filter: "all", query: "",
  // setup | loading | signed-out | not-member | ready | error
  mode: "loading",
  editingMe: false, confirmDelete: null
};
let unwatch = null;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function svgFrom(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}
function fishSvg(colorKey) {
  const c = FISH_COLORS[colorKey] || "#93bfc2";
  return svgFrom(
    `<svg viewBox="0 0 64 40" aria-hidden="true">` +
    `<path d="M3 7 L19 20 L3 33 Q7 20 3 7Z" fill="${c}" opacity="0.85"/>` +
    `<ellipse cx="36" cy="20" rx="23" ry="14" fill="${c}"/>` +
    `<path d="M30 7 Q36 0 44 7Z" fill="${c}" opacity="0.8"/>` +
    `<path d="M28 22 Q34 30 40 23" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="49" cy="16" r="4.2" fill="#fff"/><circle cx="50.2" cy="16" r="2.1" fill="#04212a"/>` +
    `<path d="M55 24 Q58 25 59 23" fill="none" stroke="#04212a" stroke-width="1.6" stroke-linecap="round"/></svg>`);
}
function finSvg(on) {
  const c = on ? "#f2d7a0" : "rgba(170,240,235,0.18)";
  return svgFrom(`<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M3 7 L19 20 L3 33 Q7 20 3 7Z" fill="${c}"/><ellipse cx="36" cy="20" rx="23" ry="14" fill="${c}"/></svg>`);
}
function coverColor(title) {
  let n = 0;
  for (const ch of String(title)) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${n % 360} 48% 42%)`;
}
function initials(title) {
  const words = String(title).replace(/^(the|a|an)\s+/i, "").split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "?").toUpperCase() + (words[1]?.[0] || "").toUpperCase();
}
// Open Library cover URL. `default=false` makes missing covers 404 so we fall back to our own.
function coverUrl(b, size = "M") {
  if (Number.isInteger(b.coverId) && b.coverId > 0) return `https://covers.openlibrary.org/b/id/${b.coverId}-${size}.jpg?default=false`;
  if (typeof b.isbn === "string" && /^[0-9X]{10,13}$/.test(b.isbn)) return `https://covers.openlibrary.org/b/isbn/${b.isbn}-${size}.jpg?default=false`;
  return null;
}
function workUrl(b) {
  return typeof b.olKey === "string" && /^\/works\/OL\d+W$/.test(b.olKey) ? "https://openlibrary.org" + b.olKey : null;
}
function coverEl(b, cls = "cover") {
  const el = h("div", { class: cls, "aria-hidden": "true" }, initials(b.title));
  el.style.setProperty("--cover", coverColor(b.title));
  const src = coverUrl(b);
  if (src) {
    const img = h("img", { src, alt: "", loading: "lazy", decoding: "async" });
    img.addEventListener("error", () => img.remove());
    el.append(img);
  }
  return el;
}
function fishName(id) { return state.fish[id]?.name || "Mystery fish"; }
function fishColor(id) { return state.fish[id]?.color || "sky"; }
function shortDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
function failMsg(e) {
  if (e?.code === "permission-denied") return "The tank wouldn't let you do that. Only a book's owner can change it.";
  if (e?.code === "unavailable") return "You look offline. Try again when you're back online.";
  return "That didn't save. Try again in a moment.";
}

// ---------- decorative swimmers ----------
(function swimmers() {
  const box = $("swimmers");
  const keys = Object.keys(FISH_COLORS);
  for (let i = 0; i < 7; i++) {
    const back = i % 3 === 0;
    const s = h("div", { class: "swimmer" + (back ? " back" : "") });
    s.style.top = (8 + ((i * 37) % 78)) + "%";
    s.style.animationDuration = ((back ? 34 : 18) + (i * 5 % 13)) + "s";
    s.style.animationDelay = (-i * 6.3) + "s";
    s.append(fishSvg(keys[i % keys.length]));
    box.append(s);
  }
  for (let i = 0; i < 14; i++) {
    const b = h("i", { class: "bubble" });
    const size = 4 + (i * 7 % 10);
    b.style.width = b.style.height = size + "px";
    b.style.left = ((i * 53) % 100) + "%";
    b.style.animationDuration = (6 + (i * 3 % 7)) + "s";
    b.style.animationDelay = (-i * 1.1) + "s";
    box.append(b);
  }
})();

// ---------- rendering ----------
const canWrite = () => state.mode === "ready" && !!state.me;
const myFish = () => (state.me ? state.fish[state.me.uid] : null);

function visibleBooks() {
  const q = state.query.trim().toLowerCase();
  return state.books
    .filter((b) => b.shelf === state.shelf)
    .filter((b) => state.filter === "all" || b.owner === state.filter)
    .filter((b) => !q || (b.title || "").toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0));
}
function members() {
  const ids = new Set(Object.keys(state.fish));
  state.books.forEach((b) => b.owner && ids.add(b.owner));
  return [...ids].sort((a, b) => fishName(a).localeCompare(fishName(b)));
}
function countsFor(id) {
  const c = { reading: 0, read: 0, want: 0 };
  state.books.forEach((b) => { if (b.owner === id && c[b.shelf] != null) c[b.shelf]++; });
  return c;
}

function renderAccount() {
  const bar = $("account");
  bar.replaceChildren();
  if (state.mode === "setup" || !state.store) return;
  if (state.me) {
    const f = myFish();
    bar.append(h("span", { class: "who" }, f ? fishSvg(f.color) : null, f?.name || state.me.name || state.me.email));
    if (state.store.kind === "demo") {
      bar.append(h("button", { class: "btn ghost small", type: "button", onclick: () => { state.store.reset(); toast("Demo reset"); } }, "Reset demo"));
    } else {
      bar.append(h("button", { class: "btn ghost small", type: "button", onclick: () => state.store.signOut() }, "Sign out"));
    }
  } else if (state.mode === "signed-out") {
    bar.append(signInButton("small"));
  }
}
function signInButton(size) {
  return h("button", { class: "btn primary" + (size ? " " + size : ""), type: "button", onclick: async () => {
    try { await state.store.signIn(); } catch (e) { console.error(e); toast("Sign-in didn't work. Try again."); }
  } }, "Sign in with Google");
}

function renderNotice() {
  const n = $("notice");
  n.replaceChildren();
  n.className = "notice";
  const p = (...kids) => h("p", null, ...kids);
  switch (state.mode) {
    case "setup":
      n.append(p(h("strong", null, "The tank isn't connected to a database yet. "),
        "Follow the setup steps in README.md to plug in Firebase. Until then you can try it out in demo mode."),
        h("a", { class: "btn primary small", href: "?demo" }, "Try the demo"));
      break;
    case "signed-out":
      n.append(p(h("strong", null, "Members only. "), "Sign in with Google to see the school's shelves and add your books."), signInButton("small"));
      break;
    case "not-member":
      n.append(p(h("strong", null, `You're signed in as ${state.me?.email}, but you're not in the school yet. `),
        "Ask whoever runs the tank to add that email to the member list, then reload."),
        h("button", { class: "btn ghost small", type: "button", onclick: () => state.store.signOut() }, "Use another account"));
      break;
    case "error":
      n.append(p(h("strong", null, "The tank stopped answering. "), "Check your connection and reload the page."));
      break;
    default:
      if (state.store?.kind === "demo") {
        n.classList.add("demo");
        n.append(p(h("strong", null, "Demo mode. "), "Books here are saved only in this browser, and the example fish aren't real."),
          h("a", { class: "btn ghost small", href: "./" }, "Leave demo"));
      } else { n.hidden = true; return; }
  }
  n.hidden = false;
}

function renderMe() {
  const p = $("me-panel");
  if (!canWrite()) { p.replaceChildren(); p.hidden = true; delete p.dataset.view; return; }
  p.hidden = false;
  const mine = myFish();
  const view = mine && !state.editingMe ? "card" : "form";
  // Don't rebuild an open form on live updates, or it wipes what's being typed.
  if (view === "form" && p.dataset.view === "form") return;
  p.dataset.view = view;
  p.replaceChildren();

  if (view === "card") {
    const c = countsFor(state.me.uid);
    p.append(h("div", { class: "me" },
      h("div", { class: "who" }, fishSvg(mine.color),
        h("div", null, h("b", null, mine.name),
          h("small", null, `You · ${c.reading} reading · ${c.read} finished · ${c.want} in the bait box`))),
      h("button", { class: "btn ghost small", type: "button", onclick: () => { state.editingMe = true; renderMe(); } }, "Change fish")));
    return;
  }

  let chosen = mine?.color || "coral";
  const nameInput = h("input", { type: "text", id: "fish-name", maxlength: "30", required: true,
    placeholder: "Sir Swims-a-Lot", value: mine?.name || (state.me.name || "").split(" ")[0] || "" });
  const swatchRow = h("div", { class: "swatches", role: "group", "aria-label": "Fish colour" });
  const drawSwatches = () => swatchRow.replaceChildren(...Object.keys(FISH_COLORS).map((k) =>
    h("button", { type: "button", class: "swatch", "aria-pressed": String(k === chosen), "aria-label": k,
      onclick: () => { chosen = k; drawSwatches(); } }, fishSvg(k))));
  drawSwatches();
  const save = h("button", { class: "btn primary", type: "submit" }, mine ? "Save fish" : "Join the school");
  const form = h("form", { class: "grid", onsubmit: async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim().slice(0, 30);
    if (!name) return;
    save.disabled = true;
    try {
      await state.store.setFish(state.me.uid, { name, color: chosen, joinedAt: mine?.joinedAt || Date.now() });
      state.editingMe = false;
      delete p.dataset.view;
      toast(mine ? "Fish updated" : `Welcome to the tank, ${name}`);
      render();
    } catch (err) { console.error(err); toast(failMsg(err)); save.disabled = false; }
  } },
    h("label", { class: "field" }, "Your fish name", nameInput),
    h("div", { class: "field" }, h("span", null, "Pick your colours"), swatchRow),
    h("div", { class: "row wide" }, save,
      mine ? h("button", { class: "btn ghost", type: "button", onclick: () => { state.editingMe = false; renderMe(); } }, "Cancel") : null));
  p.append(h("h2", null, mine ? "Change your fish" : "Every reader is a fish"),
    h("p", { class: "sub" }, mine ? "Your books keep their spot on the shelves." : "Pick a name and colour so the school knows whose books are whose."),
    form);
}

function renderStats() {
  const c = { reading: 0, read: 0, want: 0 };
  state.books.forEach((b) => { if (c[b.shelf] != null) c[b.shelf]++; });
  $("stat-reading").textContent = c.reading;
  $("stat-read").textContent = c.read;
  $("stat-want").textContent = c.want;
  $("shelves").replaceChildren(...Object.entries(SHELVES).map(([key, s]) =>
    h("button", { class: "shelf-tab", role: "tab", type: "button", id: "tab-" + key, "aria-selected": String(state.shelf === key),
      onclick: () => { state.shelf = key; state.confirmDelete = null; renderStats(); renderBooks(); } },
      h("b", null, s.name), h("small", null, s.hint), h("span", { class: "count" }, `${c[key]} book${c[key] === 1 ? "" : "s"}`))));
}

function renderFilter() {
  const ids = members();
  if (!ids.length) { $("fish-filter").replaceChildren(); return; }
  const chip = (id, label, icon) => h("button", { type: "button", class: "chip", "aria-pressed": String(state.filter === id),
    onclick: () => { state.filter = id; renderFilter(); renderBooks(); } }, icon, label);
  $("fish-filter").replaceChildren(chip("all", "Whole school", null), ...ids.map((id) => chip(id, fishName(id), fishSvg(fishColor(id)))));
}

function finsEl(book, editable) {
  const r = Number(book.rating) || 0;
  const wrap = h("div", { class: "fins", role: editable ? "group" : "img", "aria-label": r ? `${r} out of 5 fins` : "Not rated" });
  for (let i = 1; i <= 5; i++) {
    wrap.append(editable
      ? h("button", { type: "button", title: `${i} fin${i > 1 ? "s" : ""}`, "aria-label": `Rate ${i} out of 5`,
          onclick: () => updateBook(book, { rating: r === i ? 0 : i }, r === i ? "Rating cleared" : `Rated ${i}/5 fins`) }, finSvg(i <= r))
      : h("span", null, finSvg(i <= r)));
  }
  wrap.append(h("span", { class: "label" }, r ? `${r}/5 fins` : editable ? "rate it" : "unrated"));
  return wrap;
}

function renderBooks() {
  const box = $("books");
  box.replaceChildren();
  if (state.mode !== "ready") {
    const msg = { loading: "Filling the tank…", setup: "Shelves appear once the tank is connected.",
      "signed-out": "Sign in to see the shelves.", "not-member": "Members only, for now.", error: "Couldn't load the shelves." }[state.mode];
    box.append(h("div", { class: "empty" }, fishSvg("sky"), h("b", null, msg)));
    return;
  }
  const list = visibleBooks();
  if (!list.length) {
    let msg = SHELVES[state.shelf].empty;
    if (state.query) msg = "No books on this shelf match that search.";
    else if (state.filter !== "all") msg = `${fishName(state.filter)} has nothing on this shelf.`;
    const sub = !state.query && myFish() ? "Use “+ Add a book” to put one here." : "";
    box.append(h("div", { class: "empty" }, fishSvg("sky"), h("b", null, msg), sub));
    return;
  }
  for (const b of list) {
    const ownsIt = b.owner === state.me?.uid;
    const canManage = canWrite() && (ownsIt || state.isAdmin);
    const controls = [];
    if (canManage) {
      controls.push(h("select", { "aria-label": "Move to shelf", id: "move-" + b.id, onchange: (e) => {
        const shelf = e.target.value;
        const patch = { shelf };
        if (shelf === "read" && !b.finishedAt) patch.finishedAt = Date.now();
        updateBook(b, patch, `Moved to ${SHELVES[shelf].name}`);
      } }, ...Object.entries(SHELVES).map(([k, s]) => h("option", { value: k, selected: k === b.shelf }, s.name))));
      if (state.confirmDelete === b.id) {
        controls.push(h("button", { class: "btn danger small", type: "button", onclick: () => removeBook(b) }, "Release for good"),
          h("button", { class: "btn ghost small", type: "button", onclick: () => { state.confirmDelete = null; renderBooks(); } }, "Keep"));
      } else {
        controls.push(h("button", { class: "btn ghost small", type: "button", onclick: () => { state.confirmDelete = b.id; renderBooks(); } }, "Release"));
      }
    }
    const when = b.shelf === "read" && b.finishedAt ? `finished ${shortDate(b.finishedAt)}` : `added ${shortDate(b.addedAt)}`;
    const link = workUrl(b);
    box.append(h("article", { class: "book" }, coverEl(b),
      h("div", { class: "info" },
        h("h3", null, link ? h("a", { href: link, target: "_blank", rel: "noopener" }, b.title) : (b.title || "Untitled")),
        b.author ? h("p", { class: "author" }, "by ", b.author, b.year ? ` · ${b.year}` : "") : null,
        h("span", { class: "owner" }, fishSvg(fishColor(b.owner)), fishName(b.owner), ownsIt ? " (you)" : ""),
        b.shelf === "read" ? finsEl(b, ownsIt && canWrite()) : null,
        b.note ? h("p", { class: "note" }, "“", b.note, "”") : null,
        h("span", { class: "when" }, when),
        controls.length ? h("div", { class: "controls" }, controls) : null)));
  }
}

function renderSchool() {
  const ul = $("school");
  const ids = members();
  if (!ids.length) {
    ul.replaceChildren(h("li", { class: "msg" }, h("span", { class: "counts" },
      state.mode === "ready" ? "No fish yet. The first to join starts the school." : "The roster shows up once you're in.")));
    return;
  }
  ul.replaceChildren(...ids.map((id) => {
    const c = countsFor(id);
    const total = c.reading + c.read + c.want;
    const bar = h("div", { class: "bar" });
    if (total) [["reading", "k-reading"], ["read", "k-read"], ["want", "k-want"]].forEach(([k, cls]) => {
      if (c[k]) { const i = h("i", { class: cls }); i.style.width = (c[k] / total * 100) + "%"; bar.append(i); }
    });
    return h("li", null, fishSvg(fishColor(id)),
      h("div", { style: "min-width:0" },
        h("div", { class: "name" }, fishName(id), id === state.me?.uid ? h("span", { class: "you" }, "you") : null),
        h("div", { class: "counts" }, `${c.reading} reading · ${c.read} done · ${c.want} queued`),
        bar));
  }));
}

function renderStatus() {
  const n = state.books.length, f = members().length;
  $("status").textContent = state.mode === "ready"
    ? `${n} book${n === 1 ? "" : "s"} across ${f} fish.${state.store.kind === "firebase" ? " Updates live." : ""}` : "";
  $("add-open").hidden = !(canWrite() && myFish());
  if ($("add-open").hidden) $("add-panel").hidden = true;
}

function render() {
  renderAccount(); renderNotice(); renderMe(); renderStats(); renderFilter(); renderBooks(); renderSchool(); renderStatus();
}

// ---------- writes ----------
async function updateBook(b, patch, msg) {
  try { await state.store.updateBook(b.id, { ...patch, updatedAt: Date.now() }); toast(msg); }
  catch (e) { console.error(e); toast(failMsg(e)); renderBooks(); }
}
async function removeBook(b) {
  state.confirmDelete = null;
  try { await state.store.deleteBook(b.id); toast(`Released “${b.title}”`); }
  catch (e) { console.error(e); toast(failMsg(e)); renderBooks(); }
}

// ---------- add form with Open Library lookup ----------
const titleInput = $("add-title-input");
const resultsBox = $("lookup-results");
const lookup = { picked: null, results: [], active: -1, timer: 0, ctl: null };

function closeResults() {
  resultsBox.hidden = true;
  titleInput.setAttribute("aria-expanded", "false");
  titleInput.removeAttribute("aria-activedescendant");
  lookup.active = -1;
}
function showResultsMsg(text) {
  resultsBox.replaceChildren(h("li", { class: "msg" }, text));
  resultsBox.hidden = false;
  titleInput.setAttribute("aria-expanded", "true");
}
function renderResults() {
  if (!lookup.results.length) { showResultsMsg("No matches in the catalogue. You can still add it by typing the details yourself."); return; }
  resultsBox.replaceChildren(...lookup.results.map((r, i) => {
    const src = coverUrl(r, "S");
    const img = src ? h("img", { class: "mini-cover", src, alt: "", loading: "lazy" }) : h("span", { class: "mini-cover" });
    if (src) img.addEventListener("error", () => img.replaceWith(h("span", { class: "mini-cover" })));
    return h("li", { role: "option", id: "lookup-" + i, "aria-selected": String(i === lookup.active),
      onpointerdown: (e) => e.preventDefault(), onclick: () => pick(r) },
      img,
      h("div", { style: "min-width:0" }, h("div", { class: "t" }, r.title),
        h("div", { class: "a" }, [r.author || "Unknown author", r.year].filter(Boolean).join(" · "))));
  }));
  resultsBox.hidden = false;
  titleInput.setAttribute("aria-expanded", "true");
  if (lookup.active >= 0) titleInput.setAttribute("aria-activedescendant", "lookup-" + lookup.active);
  else titleInput.removeAttribute("aria-activedescendant");
}
async function searchCatalogue(q) {
  lookup.ctl?.abort();
  lookup.ctl = new AbortController();
  showResultsMsg("Searching the catalogue…");
  const url = "https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,first_publish_year,cover_i&q=" + encodeURIComponent(q);
  try {
    const res = await fetch(url, { signal: lookup.ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    lookup.results = (json.docs || []).filter((d) => d.title).map((d) => ({
      title: String(d.title).slice(0, 200),
      author: (d.author_name || []).slice(0, 2).join(", ").slice(0, 200),
      year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
      coverId: Number.isInteger(d.cover_i) ? d.cover_i : null,
      olKey: typeof d.key === "string" ? d.key : null
    }));
    lookup.active = -1;
    if (document.activeElement === titleInput) renderResults();
  } catch (e) {
    if (e.name === "AbortError") return;
    showResultsMsg("Couldn't reach Open Library. You can still type the book in yourself.");
  }
}
function pick(r) {
  lookup.picked = r;
  titleInput.value = r.title;
  $("add-author").value = r.author || "";
  closeResults();
  renderPicked();
}
function renderPicked() {
  const box = $("picked");
  const r = lookup.picked;
  if (!r) { box.hidden = true; box.replaceChildren(); return; }
  const src = coverUrl(r, "M");
  const img = src ? h("img", { class: "mini-cover", src, alt: "" }) : h("span", { class: "mini-cover" });
  box.replaceChildren(img,
    h("div", null, h("b", null, r.title), [r.author, r.year].filter(Boolean).join(" · ") || "From Open Library"),
    h("button", { class: "btn ghost small", type: "button", onclick: () => { lookup.picked = null; renderPicked(); titleInput.focus(); } }, "Not this one"));
  box.hidden = false;
}
titleInput.addEventListener("input", () => {
  if (lookup.picked) { lookup.picked = null; renderPicked(); }
  clearTimeout(lookup.timer);
  const q = titleInput.value.trim();
  if (q.length < 3) { lookup.ctl?.abort(); closeResults(); return; }
  lookup.timer = setTimeout(() => searchCatalogue(q), 350);
});
titleInput.addEventListener("keydown", (e) => {
  if (resultsBox.hidden || !lookup.results.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = lookup.results.length;
    lookup.active = e.key === "ArrowDown" ? (lookup.active + 1) % n : (lookup.active - 1 + n) % n;
    renderResults();
  } else if (e.key === "Enter" && lookup.active >= 0) {
    e.preventDefault();
    pick(lookup.results[lookup.active]);
  } else if (e.key === "Escape") {
    closeResults();
  }
});
titleInput.addEventListener("blur", () => setTimeout(closeResults, 120));
titleInput.addEventListener("focus", () => { if (lookup.results.length && !lookup.picked && titleInput.value.trim().length >= 3) renderResults(); });

function resetAddForm() {
  $("add-form").reset();
  lookup.picked = null; lookup.results = [];
  renderPicked(); closeResults();
}
$("add-open").addEventListener("click", () => {
  $("add-panel").hidden = false;
  $("add-shelf").value = state.shelf;
  titleInput.focus();
});
$("add-cancel").addEventListener("click", () => { resetAddForm(); $("add-panel").hidden = true; });
$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim().slice(0, 200);
  if (!title || !canWrite()) return;
  const shelf = $("add-shelf").value;
  const now = Date.now();
  const r = lookup.picked;
  const doc = {
    title, author: $("add-author").value.trim().slice(0, 200), shelf,
    note: $("add-note").value.trim().slice(0, 280), owner: state.me.uid, rating: 0,
    addedAt: now, updatedAt: now,
    coverId: r?.coverId ?? null, olKey: r?.olKey ?? null, year: r?.year ?? null
  };
  if (shelf === "read") doc.finishedAt = now;
  const btn = $("add-submit");
  btn.disabled = true;
  try {
    await state.store.addBook(doc);
    resetAddForm();
    $("add-panel").hidden = true;
    state.shelf = shelf;
    state.filter = "all";
    toast(`Added to ${SHELVES[shelf].name}`);
    render();
  } catch (err) { console.error(err); toast(failMsg(err)); }
  btn.disabled = false;
});
$("search").addEventListener("input", (e) => { state.query = e.target.value; renderBooks(); });

// ---------- boot ----------
function startWatching() {
  unwatch?.();
  let got = { books: false, fish: false };
  const ready = () => { if (got.books && got.fish && state.mode === "loading") state.mode = "ready"; };
  unwatch = state.store.watch(
    (books) => { state.books = books; got.books = true; ready(); render(); },
    (fish) => { state.fish = fish; got.fish = true; ready(); render(); },
    (err) => {
      console.error(err);
      state.mode = err?.code === "permission-denied" ? "not-member" : "error";
      state.books = []; state.fish = {};
      render();
    });
}

async function boot() {
  const demo = new URLSearchParams(location.search).has("demo");
  const configured = firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).startsWith("PASTE");
  render();
  if (!demo && !configured) { state.mode = "setup"; render(); return; }
  try {
    state.store = demo ? demoStore() : await firebaseStore(firebaseConfig);
  } catch (e) {
    console.error(e);
    state.mode = "error"; render(); return;
  }
  state.store.onAuth(async (user) => {
    unwatch?.(); unwatch = null;
    state.me = user; state.books = []; state.fish = {}; state.isAdmin = false; state.editingMe = false;
    if (!user) { state.mode = "signed-out"; render(); return; }
    state.mode = "loading";
    render();
    startWatching();
    state.isAdmin = await state.store.isAdmin(user);
    render();
  });
}
boot();
