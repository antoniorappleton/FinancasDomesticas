export async function init() {
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await window.sb.auth.signOut();
    location.hash = "#/";
  });
}
