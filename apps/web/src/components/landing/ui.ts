import gsap from "gsap";
import { need } from "./dom";

function setupMenu(root: HTMLElement): () => void {
  const head = need(root, ".br-head");
  const menu = need(root, ".br-menu");
  const nav = need(root, ".br-nav");
  const setOpen = (open: boolean) => {
    head.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const onMenu = () => setOpen(!head.classList.contains("is-open"));
  const onNav = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("button, a")) setOpen(false);
  };
  menu.addEventListener("click", onMenu);
  nav.addEventListener("click", onNav);
  return () => {
    menu.removeEventListener("click", onMenu);
    nav.removeEventListener("click", onNav);
  };
}

function setupLedger(root: HTMLElement, reduced: boolean): () => void {
  const toggle = need(root, ".br-switch");
  const ledger = need(root, ".br-ledger");
  const cells = Array.from(root.querySelectorAll<HTMLElement>(".br-led td"));
  const onSwitch = () => {
    const leaked = toggle.getAttribute("aria-checked") !== "true";
    toggle.setAttribute("aria-checked", leaked ? "true" : "false");
    ledger.classList.toggle("is-leaked", leaked);
    for (const cell of cells) cell.textContent = cell.getAttribute(leaked ? "data-leaked" : "data-sealed");
    if (!reduced) gsap.fromTo(cells, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "expo.out", stagger: 0.025, overwrite: true });
  };
  toggle.addEventListener("click", onSwitch);
  return () => {
    toggle.removeEventListener("click", onSwitch);
    gsap.killTweensOf(cells);
    gsap.set(cells, { clearProps: "transform,opacity,visibility" });
  };
}

function setupGoto(root: HTMLElement, reduced: boolean): () => void {
  const onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const id = event.target.closest("[data-goto]")?.getAttribute("data-goto");
    if (!id) return;
    root.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

export function setupUi(root: HTMLElement, reduced: boolean): () => void {
  const teardowns = [setupMenu(root), setupLedger(root, reduced), setupGoto(root, reduced)];
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
