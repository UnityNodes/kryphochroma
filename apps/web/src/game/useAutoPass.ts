"use client";

import { useEffect, useRef } from "react";
import { AUTO_PASS_MS } from "./autoPass";

export function useAutoPass(due: string | null, pass: () => void): void {
  const tried = useRef<string | null>(null);
  const latest = useRef(pass);
  useEffect(() => {
    latest.current = pass;
  });
  useEffect(() => {
    if (due === null || tried.current === due) return;
    const timer = setTimeout(() => {
      tried.current = due;
      latest.current();
    }, AUTO_PASS_MS);
    return () => clearTimeout(timer);
  }, [due]);
}
