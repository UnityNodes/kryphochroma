import { bindInput } from "./input";
import { forcesHq, readDebug } from "./debug";
import { PORTRAIT_ASPECT } from "./constants";
import type { Frame } from "./layout";
import { type TableInput, createRuntime } from "./runtime";
import { createStage } from "./stage";

export interface MountOptions {
  readonly root: HTMLElement;
  readonly host: HTMLElement;
  readonly seal: HTMLElement;
  readonly reducedMotion: boolean;
  readonly input: TableInput;
  readonly onLost: () => void;
}

export interface TableHandle {
  readonly update: (input: TableInput) => void;
  readonly unmount: () => void;
}

/** The header lies over the top of the picture and the status line and buttons over its foot. The table is composed between the two, so both are measured from the page instead of being repeated here as numbers. */
function frameOf(root: HTMLElement, host: HTMLElement): Frame {
  const box = host.getBoundingClientRect();
  const header = root.closest(".kc-app")?.querySelector("header.kc-top")?.getBoundingClientRect();
  const status = root.querySelector(".kc-status")?.getBoundingClientRect();
  const frame = { head: header ? Math.max(0, header.bottom - box.top) : 0, dock: status ? Math.max(0, box.bottom - status.top) : 0 };
  root.style.setProperty("--kc-head", `${frame.head}px`);
  root.style.setProperty("--kc-dock", `${frame.dock}px`);
  return frame;
}

/** Returns null when this browser gives no WebGL context, and calls `onLost` if the context is taken away later. Either way the caller goes back to the 2D table. */
export function mountTable3d(options: MountOptions): TableHandle | null {
  const { root, host, seal } = options;
  const debug = readDebug(window);
  const portrait = host.clientWidth / Math.max(1, host.clientHeight) < PORTRAIT_ASPECT;
  const stage = createStage(host, forcesHq(debug), portrait);
  if (!stage) return null;

  const table = createRuntime(stage, { root, host, seal, frame: () => frameOf(root, host) }, options.reducedMotion, debug, options.input);
  const unbind = bindInput({ root, host }, table);
  const observer = new ResizeObserver(() => table.relayout());
  observer.observe(host);
  const dock = root.querySelector(".kc-you");
  if (dock) observer.observe(dock);
  const onVisibility = () => table.setHidden(document.hidden);
  const onLost = (event: Event) => {
    event.preventDefault();
    options.onLost();
  };
  document.addEventListener("visibilitychange", onVisibility);
  stage.canvas.addEventListener("webglcontextlost", onLost);
  root.classList.add("kc-3d-live");

  let mounted = true;
  return {
    update: (input) => {
      if (mounted) table.update(input);
    },
    unmount: () => {
      if (!mounted) return;
      mounted = false;
      stage.canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      unbind();
      table.dispose();
      stage.dispose();
      root.classList.remove("kc-3d-live", "kc-3d-portrait", "kc-3d-bare");
      root.style.removeProperty("--kc-head");
      root.style.removeProperty("--kc-dock");
      for (const el of root.querySelectorAll<HTMLElement>("[data-placed]")) {
        el.removeAttribute("data-placed");
        el.removeAttribute("data-align");
        el.removeAttribute("data-far");
        el.style.transform = "";
        el.style.width = "";
        el.style.height = "";
      }
    },
  };
}
