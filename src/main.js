import { supabase, isConfigured } from "./supabase.js";
import { sampleArt } from "./sample-data.js";

const galleryEl = document.getElementById("gallery");
const presenceEl = document.getElementById("presence");
const presenceTextEl = document.getElementById("presence-text");

/** Load art pieces from Supabase, or fall back to sample data. */
async function loadArt() {
  if (!isConfigured) return sampleArt;
  const { data, error } = await supabase
    .from("art_pieces")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Supabase fetch failed, using sample data:", error.message);
    return sampleArt;
  }
  return data?.length ? data : sampleArt;
}

function money(n) {
  return `$${Number(n || 0).toFixed(0)}`;
}

function cardHTML(piece) {
  const link = piece.payment_link || "#";
  const img = piece.image_url || "";
  return `
    <article class="card" data-piece-id="${piece.id}">
      ${img ? `<img class="card-img" src="${img}" alt="${escapeAttr(piece.title)}" loading="lazy" />` : `<div class="card-img"></div>`}
      <div class="card-body">
        <h2 class="card-title">${escapeHTML(piece.title)}</h2>
        <p class="card-desc">${escapeHTML(piece.description || "")}</p>
        <p class="card-viewers" data-viewers-for="${piece.id}"></p>
        <div class="card-foot">
          <span class="price">${money(piece.suggested_amount)} <small>suggested tip</small></span>
          <a class="btn-tip" href="${link}" target="_blank" rel="noopener noreferrer">Tip the artist</a>
        </div>
      </div>
    </article>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s);
}

function render(pieces) {
  if (!pieces.length) {
    galleryEl.innerHTML = `<p class="empty">No pieces yet — check back soon.</p>`;
    return;
  }
  galleryEl.innerHTML = pieces.map(cardHTML).join("");
}

/**
 * Live presence: each visitor joins a shared Realtime channel and tracks which
 * piece (if any) is in view. We show a global "N people here now" pill plus a
 * per-card viewer count. Presence is ephemeral — it never touches the database.
 */
function startPresence() {
  if (!isConfigured) return; // no realtime without Supabase
  const visitorId = crypto.randomUUID();
  const channel = supabase.channel("streetside-presence", {
    config: { presence: { key: visitorId } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const visitors = Object.values(state).flat();
      updatePresenceUI(visitors);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ viewing: null, at: Date.now() });
      }
    });

  // Update which piece a visitor is "viewing" as cards scroll into view.
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .map((e) => e.target.dataset.pieceId);
      if (visible.length) {
        channel.track({ viewing: visible[0], at: Date.now() });
      }
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll(".card").forEach((c) => io.observe(c));
}

function updatePresenceUI(visitors) {
  const count = visitors.length;
  presenceEl.hidden = count <= 0;
  presenceTextEl.textContent =
    count === 1 ? "You're the only one here right now" : `${count} people here right now`;

  // Per-card counts
  const byPiece = {};
  for (const v of visitors) {
    if (v.viewing) byPiece[v.viewing] = (byPiece[v.viewing] || 0) + 1;
  }
  document.querySelectorAll("[data-viewers-for]").forEach((el) => {
    const id = el.dataset.viewersFor;
    const n = byPiece[id] || 0;
    el.textContent = n > 0 ? `👀 ${n} looking now` : "";
  });
}

(async function init() {
  const pieces = await loadArt();
  render(pieces);
  startPresence();
})();
