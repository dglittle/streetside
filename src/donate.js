// Donation flow: a small modal lets the donor choose any amount, then we ask the
// `square-checkout` Edge Function to create a Square hosted checkout (with
// shipping-address collection) and redirect there. Card + address stay on Square.

import { supabase, isConfigured } from "./supabase.js";

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement("div");
  modalEl.className = "donate-overlay";
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="donate-modal" role="dialog" aria-modal="true" aria-labelledby="donate-title">
      <button class="donate-close" aria-label="Close">×</button>
      <h3 id="donate-title">Tip the artist</h3>
      <p class="donate-sub" id="donate-sub"></p>
      <div class="donate-presets">
        <button type="button" data-amt="5">$5</button>
        <button type="button" data-amt="10">$10</button>
        <button type="button" data-amt="20">$20</button>
      </div>
      <label class="donate-custom">
        <span>$</span>
        <input id="donate-amount" type="number" min="1" step="1" inputmode="decimal" placeholder="Other amount" />
      </label>
      <button id="donate-go" class="btn-tip donate-go">Continue to payment →</button>
      <p class="donate-status" id="donate-status"></p>
      <p class="donate-note">You'll add your shipping address securely on Square's page.</p>
    </div>`;
  document.body.appendChild(modalEl);

  const close = () => (modalEl.hidden = true);
  modalEl.querySelector(".donate-close").addEventListener("click", close);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) close();
  });

  const amountInput = modalEl.querySelector("#donate-amount");
  modalEl.querySelectorAll(".donate-presets button").forEach((b) => {
    b.addEventListener("click", () => {
      amountInput.value = b.dataset.amt;
      modalEl
        .querySelectorAll(".donate-presets button")
        .forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
  });

  return modalEl;
}

/** Open the donate modal for a piece (title + suggested amount). */
export function openDonate(piece) {
  const m = ensureModal();
  const sub = m.querySelector("#donate-sub");
  const status = m.querySelector("#donate-status");
  const amountInput = m.querySelector("#donate-amount");
  const goBtn = m.querySelector("#donate-go");

  const title = piece?.title || "";
  const suggested = Number(piece?.suggested_amount) || 5;
  sub.textContent = title ? `for "${title}"` : "";
  amountInput.value = suggested;
  status.textContent = "";
  m.querySelectorAll(".donate-presets button").forEach((x) =>
    x.classList.toggle("selected", Number(x.dataset.amt) === suggested)
  );
  m.hidden = false;
  amountInput.focus();

  goBtn.onclick = async () => {
    const amount = Number(amountInput.value);
    if (!Number.isFinite(amount) || amount < 1) {
      status.textContent = "Please enter an amount of at least $1.";
      return;
    }
    if (!isConfigured) {
      status.textContent = "Donations aren't configured yet.";
      return;
    }
    goBtn.disabled = true;
    status.textContent = "Taking you to secure checkout…";
    try {
      const { data, error } = await supabase.functions.invoke("square-checkout", {
        body: { amount, pieceTitle: title, redirectUrl: window.location.origin },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No checkout URL returned.");
      window.location.href = data.url; // off to Square's hosted page
    } catch (err) {
      status.textContent = "Error: " + err.message;
      goBtn.disabled = false;
    }
  };
}
