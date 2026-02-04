// Validações e helpers simples
window.validators = {
  isISODate(d) {
    return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  },
  assert(cond, msg) {
    if (!cond) throw new Error(msg || "Operação inválida");
  },
  positiveAmount(n) {
    return typeof n === "number" && isFinite(n) && n > 0;
  }
};
