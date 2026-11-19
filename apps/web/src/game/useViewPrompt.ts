"use client";

import { useCallback, useEffect, useState } from "react";
import { VIEW_PARAM } from "./tableView";

const ASKED_PREFIX = "kc-view-asked:";

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The look of the table is asked for when a game opens, once per table in this tab, so a player picks it while looking at the table rather than on a menu page. A link that names the view has already answered. Until the check has run neither answer is known, so other start-up dialogs wait for `settled`. */
export function useViewPrompt(): { readonly asking: boolean; readonly settled: boolean; readonly answered: () => void } {
  const [asking, setAsking] = useState<boolean | null>(null);
  useEffect(() => {
    setAsking(!new URLSearchParams(window.location.search).has(VIEW_PARAM) && !wasAsked());
  }, []);
  const answered = useCallback(() => {
    setAsking(false);
    try {
      session()?.setItem(ASKED_PREFIX + window.location.pathname, "1");
    } catch {
      return;
    }
  }, []);
  return { asking: asking === true, settled: asking === false, answered };
}

function wasAsked(): boolean {
  try {
    return session()?.getItem(ASKED_PREFIX + window.location.pathname) === "1";
  } catch {
    return true;
  }
}
