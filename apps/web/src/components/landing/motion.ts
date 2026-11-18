import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { need } from "./dom";
import { type Room, isShotKey } from "./state";

gsap.registerPlugin(ScrollTrigger);

function scrubShots(room: Room): void {
  const shots = room.root.querySelectorAll("[data-shot]");
  shots.forEach((section, order) => {
    const key = `s${section.getAttribute("data-shot")}`;
    if (!isShotKey(key)) throw new Error(`landing markup has an unknown shot ${key}`);
    const tween = gsap.fromTo(
      room.prog,
      { [key]: 0 },
      { [key]: 1, ease: "none", scrollTrigger: { trigger: section, start: order === 0 ? "top top" : "top center", end: "bottom center", scrub: 0.6 } },
    );
    if (tween.scrollTrigger) room.trig.push(tween.scrollTrigger);
  });
  const close = gsap.fromTo(room.prog, { c: 0 }, { c: 1, ease: "none", scrollTrigger: { trigger: need(room.root, "[data-close]"), start: "top bottom", end: "bottom bottom", scrub: 0.6 } });
  room.closeTrig = close.scrollTrigger ?? null;
}

function followScroll(head: HTMLElement): void {
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      const y = self.scroll();
      head.classList.toggle("is-solid", y > 30);
      if (!head.classList.contains("is-open")) head.classList.toggle("is-away", self.direction === 1 && y > 240);
    },
  });
}

export function setupMotion(room: Room): () => void {
  if (room.reduced) return () => undefined;
  const root = room.root;
  const head = need(root, ".br-head");
  const context = gsap.context(() => {
    gsap.from(root.querySelectorAll(".br-hero [data-in]"), { y: 22, autoAlpha: 0, duration: 0.7, ease: "expo.out", stagger: 0.06, delay: 0.05 });
    for (const block of root.querySelectorAll("[data-rv]")) {
      gsap.from(block, { y: 26, autoAlpha: 0, duration: 0.8, ease: "expo.out", scrollTrigger: { trigger: block, start: "top 92%", once: true } });
    }
    if (room.rig) scrubShots(room);
    followScroll(head);
  }, root);
  return () => {
    context.revert();
    room.trig.length = 0;
    room.closeTrig = null;
  };
}

export function refreshMotion(): void {
  ScrollTrigger.refresh();
}
