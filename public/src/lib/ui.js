export class Toast {
  static show(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container); // Safe, fixed position
    }

    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.setAttribute("role", "alert");
    el.innerHTML = `
      <div class="toast__content">${message}</div>
      <button class="toast__close" aria-label="Fechar notificação">×</button>
    `;

    // Remove on click
    el.querySelector(".toast__close").addEventListener("click", () => {
      el.remove();
    });

    // Auto remove
    const duration = type === "error" ? 5000 : 3000;
    setTimeout(() => {
      if (document.body.contains(el)) {
        el.classList.add("toast--out");
        el.addEventListener("animationend", () => el.remove());
      }
    }, duration);

    container.appendChild(el);
  }

  static success(msg) {
    this.show(msg, "success");
  }
  static error(msg) {
    this.show(msg, "error");
  }
  static info(msg) {
    this.show(msg, "info");
  }
}

export class Modal {
  // Promise-based confirm modal replacement
  static confirm({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", destruct = false }) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "wb-modal-dialog";
      dialog.innerHTML = `
        <div class="wb-modal-content">
          <h3 class="wb-modal-title">${title || "Confirmação"}</h3>
          <p class="wb-modal-msg">${message}</p>
          <div class="wb-modal-actions">
            <button class="btn btn--ghost js-cancel">${cancelText}</button>
            <button class="btn ${destruct ? "btn--danger" : "btn--primary"} js-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.showModal();

      const cleanup = () => {
        dialog.close();
        dialog.remove();
      };

      dialog.querySelector(".js-confirm").addEventListener("click", () => {
        cleanup();
        resolve(true);
      });

      dialog.querySelector(".js-cancel").addEventListener("click", () => {
        cleanup();
        resolve(false);
      });

      dialog.addEventListener("cancel", () => {
        cleanup();
        resolve(false);
      });
    });
  }
}
