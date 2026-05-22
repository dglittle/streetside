import { supabase, isConfigured } from "./supabase.js";
import { sampleArt } from "./sample-data.js";
import {
  captureKeyFromHash,
  isAdmin,
  logout,
  deletePiece,
  createPiece,
} from "./admin.js";

// Capture an admin magic-link key (#k=...) before anything renders, so the
// fragment is scrubbed from the URL immediately on load.
captureKeyFromHash();

const galleryEl = document.getElementById("gallery");
const presenceEl = document.getElementById("presence");
const presenceTextEl = document.getElementById("presence-text");
const adminBarEl = document.getElementById("admin-bar");

let currentPieces = [];

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
  const adminControls = isAdmin()
    ? `<button class="btn-delete" data-delete-id="${piece.id}" title="Delete this piece">Delete</button>`
    : "";
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
        ${adminControls}
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
  currentPieces = pieces;
  if (!pieces.length) {
    galleryEl.innerHTML = `<p class="empty">No pieces yet — check back soon.</p>`;
    return;
  }
  galleryEl.innerHTML = pieces.map(cardHTML).join("");
  if (isAdmin()) wireDeleteButtons();
}

async function reload() {
  render(await loadArt());
}

/* ----------------------- Admin mode ----------------------- */

function renderAdminBar() {
  if (!isAdmin()) {
    adminBarEl.hidden = true;
    adminBarEl.innerHTML = "";
    return;
  }
  if (!isConfigured) {
    adminBarEl.hidden = false;
    adminBarEl.innerHTML = `<span>Admin mode (connect Supabase to enable edits)</span>`;
    return;
  }
  adminBarEl.hidden = false;
  adminBarEl.innerHTML = `
    <div class="admin-row">
      <strong>✦ Admin mode</strong>
      <button id="admin-logout" class="btn-admin ghost">Log out</button>
    </div>
    <form id="add-form" class="add-form">
      <input id="add-image" name="image" type="file" accept="image/*" required />
      <div class="add-form-actions">
        <button type="submit" class="btn-admin">Add image</button>
        <span id="add-status" class="add-status"></span>
      </div>
    </form>`;

  document.getElementById("admin-logout").addEventListener("click", () => {
    logout();
    renderAdminBar();
    reload();
  });
  const form = document.getElementById("add-form");
  form.addEventListener("submit", onAddSubmit);
}

async function onAddSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const statusEl = document.getElementById("add-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const fd = new FormData(form);
  const file = fd.get("image");

  if (!file || file.size === 0) {
    statusEl.textContent = "Please choose an image.";
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = "Uploading…";
  try {
    await createPiece({
      // Image-only: title falls back to the filename so the DB row is valid.
      title: file.name.replace(/\.[^.]+$/, "") || "Untitled",
      file,
    });
    statusEl.textContent = "Added ✓";
    form.reset();
    await reload();
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  } finally {
    submitBtn.disabled = false;
  }
}

function wireDeleteButtons() {
  document.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteId;
      const piece = currentPieces.find((p) => String(p.id) === String(id));
      const name = piece ? piece.title : "this piece";
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        await deletePiece(id);
        await reload();
      } catch (err) {
        alert("Could not delete: " + err.message);
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
  });
}

/* ----------------------- Live presence ----------------------- */

/**
 * Each visitor joins a shared Realtime channel and tracks which piece (if any)
 * is in view. We show a global "N people here now" pill plus per-card counts.
 * Presence is ephemeral — it never touches the database.
 */
function startPresence() {
  if (!isConfigured) return;
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
  renderAdminBar();
  await reload();
  startPresence();
})();
