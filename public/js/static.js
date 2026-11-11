import { api, toast } from "./common.js";

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const form = document.querySelector("#return-form");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#return-submit");
    const msg = document.querySelector("#return-msg");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    button.disabled = true;
    button.textContent = "Enviando…";
    msg.className = "form-msg";
    msg.textContent = "";
    try {
      const result = await api("/api/returns", {
        method: "POST",
        body: JSON.stringify({
          orderId: document.querySelector("#return-order").value.trim(),
          email: document.querySelector("#return-email").value.trim(),
          reason: document.querySelector("#return-reason").value.trim(),
        }),
      });
      msg.className = "form-msg is-ok";
      msg.textContent = result.message;
      form.reset();
      toast("Solicitud enviada");
    } catch (error) {
      msg.className = "form-msg is-error";
      msg.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Solicitar la devolución";
    }
  });
}
