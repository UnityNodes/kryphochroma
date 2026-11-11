"use client";

import type { Profile } from "@kryphochroma/abi";
import { useEffect, useState } from "react";
import { PROFILE_CHANGED } from "@/chain/profile";

const REFRESH_MS = 20_000;

export function useProfiles(addresses: readonly string[]): Readonly<Record<string, Profile>> {
  const [profiles, setProfiles] = useState<Readonly<Record<string, Profile>>>({});
  const key = addresses.map((a) => a.toLowerCase()).join(",");
  useEffect(() => {
    if (!key) return;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/profiles?ids=${key}`);
        const body = (await res.json()) as { profiles?: Record<string, Profile> };
        if (!stopped && body.profiles) setProfiles(body.profiles);
      } catch {
        return;
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(PROFILE_CHANGED, load);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener(PROFILE_CHANGED, load);
    };
  }, [key]);
  return profiles;
}
