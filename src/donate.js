// Lightbox + request flow.
//
// Clicking a gallery image opens an enlarged view with a tip-amount input (which
// may be 0) and a "Request" button:
//   - amount >= $1  -> Square hosted checkout (collects shipping; Square emails the seller)
//   - amount == 0   -> our own name + shipping form -> free-request Edge Function
//                      (saves to Supabase + emails the seller)

import { supabase, isConfigured } from "./supabase.js";

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "lb-overlay";
  overlayEl.hidden = true;
  overlayEl.innerHTML = `
    <div class="lb-modal" role="dialog" aria-modal="true">
      <button class="lb-close" aria-label="Close">×</button>
      <img class="lb-img" alt="" />
      <div class="lb-panel">
        <label class="lb-amount">
          <span>$</span>
          <input id="lb-amount" type="number" min="0" step="1" inputmode="decimal" placeholder="Tip amount (0 is OK)" />
        </label>
        <button id="lb-request" class="btn-tip lb-request">Request</button>
        <p class="lb-status" id="lb-status"></p>

        <form id="lb-ship" class="lb-ship" hidden>
          <p class="lb-ship-intro">No tip — just tell me where to ship it:</p>
          <input name="name" placeholder="Your name" required />
          <input name="email" type="email" placeholder="Your email" required />
          <input name="address1" placeholder="Address line 1" required />
          <input name="address2" placeholder="Address line 2 (optional)" />
          <div class="lb-ship-row">
            <input name="city" placeholder="City" required />
            <input name="state" placeholder="State" required />
            <input name="postal" placeholder="ZIP" required />
          </div>
          <input name="country" placeholder="Country" value="USA" required />
          <textarea name="note" placeholder="Note (optional)"></textarea>
          <button type="submit" class="btn-tip">Send request</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(overlayEl);

  const close = () => {
    overlayEl.hidden = true;
  };
  overlayEl.querySelector(".lb-close").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) close();
  });

  return overlayEl;
}

export function openLightbox(piece) {
  const o = ensureOverlay();
  const img = o.querySelector(".lb-img");
  const amountInput = o.querySelector("#lb-amount");
  const requestBtn = o.querySelector("#lb-request");
  const statusEl = o.querySelector("#lb-status");
  const shipForm = o.querySelector("#lb-ship");

  img.src = piece?.image_url || "";
  img.alt = piece?.title || "";
  amountInput.value = "";
  statusEl.textContent = "";
  shipForm.hidden = true;
  shipForm.reset?.();
  requestBtn.disabled = false;
  requestBtn.textContent = "Request";
  o.hidden = false;

  const title = piece?.title || "";
  const pieceId = piece?.id ? String(piece.id) : "";

  requestBtn.onclick = async () => {
    const amount = Number(amountInput.value || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      statusEl.textContent = "Please enter 0 or a positive amount.";
      return;
    }
    if (!isConfigured) {
      statusEl.textContent = "Requests aren't configured yet.";
      return;
    }

    // Free request -> reveal the shipping form (Square can't process $0).
    if (amount === 0) {
      shipForm.hidden = false;
      statusEl.textContent = "";
      shipForm.querySelector('input[name="name"]').focus();
      return;
    }

    // Paid -> Square checkout (collects shipping there).
    requestBtn.disabled = true;
    statusEl.textContent = "Taking you to secure checkout…";
    try {
      const { data, error } = await supabase.functions.invoke("square-checkout", {
        body: {
          amount,
          pieceTitle: title,
          pieceId,
          redirectUrl: window.location.origin,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No checkout URL returned.");
      window.location.href = data.url;
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
      requestBtn.disabled = false;
    }
  };

  shipForm.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = shipForm.querySelector('button[type="submit"]');
    const fd = new FormData(shipForm);
    submitBtn.disabled = true;
    statusEl.textContent = "Sending your request…";
    try {
      const { data, error } = await supabase.functions.invoke("free-request", {
        body: {
          pieceTitle: title,
          pieceId,
          name: fd.get("name"),
          email: fd.get("email"),
          address1: fd.get("address1"),
          address2: fd.get("address2"),
          city: fd.get("city"),
          state: fd.get("state"),
          postal: fd.get("postal"),
          country: fd.get("country"),
          note: fd.get("note"),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      statusEl.textContent = "Request sent — thank you! ✓";
      shipForm.hidden = true;
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
      submitBtn.disabled = false;
    }
  };
}
