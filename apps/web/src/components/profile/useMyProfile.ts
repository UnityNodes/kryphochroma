"use client";

import type { Profile } from "@kryphochroma/abi";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadBurner } from "@/chain/burner";
import { loadProfile, publishProfile, saveProfile } from "@/chain/profile";

const local = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

async function publish(profile: Profile): Promise<boolean> {
  try {
    return await publishProfile(loadBurner(window.sessionStorage), profile);
  } catch {
    return false;
  }
}

export function useMyProfile(): { readonly profile: Profile | null; readonly update: (profile: Profile) => Promise<boolean> } {
  const [profile, setProfile] = useState<Profile | null>(() => (typeof window === "undefined" ? null : loadProfile(local())));

  const first = useRef(profile);
  useEffect(() => {
    if (first.current) void publish(first.current);
  }, []);

  const update = useCallback(async (next: Profile) => {
    saveProfile(local(), next);
    setProfile(next);
    return publish(next);
  }, []);

  return { profile, update };
}
