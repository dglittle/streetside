import { supabase, isConfigured } from "./supabase.js";
import { sampleArt } from "./sample-data.js";
import {
  captureKeyFromHash,
  isAdmin,
  logout,
  deletePiece,
  createPiece,
} from "./admin.js";
import { openLightbox } from "./donate.js";

// Capture an admin magic-link key (#k=...) before anything renders, so the
// fragment is scrubbed from the URL immediately on load.
captureKeyFromHash();

const galleryEl = document.getElementById("gallery");
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

function cardHTML(piece) {
  const img = piece.image_url || "";
  // Image-only card: the whole, uncropped image. Clicking it opens the lightbox.
  const adminControls = isAdmin()
    ? `<button class="btn-delete" data-delete-id="${piece.id}" title="Delete this piece">Delete</button>`
    : "";
  return `
    <article class="card" data-piece-id="${piece.id}">
      ${img
        ? `<img class="card-img" src="${img}" alt="${escapeAttr(piece.title)}" loading="lazy" data-open-id="${piece.id}" />`
        : `<div class="card-img placeholder"></div>`}
      ${adminControls}
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
  wireImageClicks();
  if (isAdmin()) wireDeleteButtons();
}

function wireImageClicks() {
  document.querySelectorAll("[data-open-id]").forEach((img) => {
    img.addEventListener("click", () => {
      const piece = currentPieces.find(
        (p) => String(p.id) === String(img.dataset.openId)
      );
      openLightbox(piece);
    });
  });
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

(async function init() {
  renderAdminBar();
  await reload();
})();
