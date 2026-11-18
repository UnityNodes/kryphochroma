"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_VIEW, type TableViewMode, readStoredView, resolveView, storeView } from "./tableView";

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface TableViewChoice {
  readonly view: TableViewMode;
  readonly choose: (mode: TableViewMode) => void;
  readonly fallBack: () => void;
}

/** The first render is always the default view, on the server and in the browser alike; the address and the stored choice are read after it. `fallBack` leaves the stored choice alone: a browser that could not draw the 3D table today may be able to tomorrow. */
export function useTableView(): TableViewChoice {
  const [view, setView] = useState<TableViewMode>(DEFAULT_VIEW);
  useEffect(() => {
    setView(resolveView(window.location.search, readStoredView(storage())));
  }, []);
  const choose = useCallback((mode: TableViewMode) => {
    setView(mode);
    storeView(storage(), mode);
  }, []);
  const fallBack = useCallback(() => setView("2d"), []);
  return { view, choose, fallBack };
}
