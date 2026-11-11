import { AVATAR_ICONS, type Profile, avatarOf, profileMessage, validProfile } from "@kryphochroma/abi";
import type { PrivateKeyAccount } from "viem";

const PROFILE_KEY = "kc-profile";
const PROFILE_EVENT = "kc-profile";

export function loadProfile(storage: Pick<Storage, "getItem"> | null): Profile | null {
  try {
    return validProfile(JSON.parse(storage?.getItem(PROFILE_KEY) ?? "null") ?? {});
  } catch {
    return null;
  }
}

export function saveProfile(storage: Pick<Storage, "setItem"> | null, profile: Profile): void {
  try {
    storage?.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    return;
  }
}

export function randomAvatar(random: () => number = Math.random): string {
  return avatarOf(AVATAR_ICONS[Math.floor(random() * AVATAR_ICONS.length)] ?? "cat", Math.floor(random() * 5));
}

export async function publishProfile(burner: PrivateKeyAccount, profile: Profile): Promise<boolean> {
  const signature = await burner.signMessage({ message: profileMessage(profile) });
  const res = await fetch("/api/profile", { method: "POST", body: JSON.stringify({ ...profile, signature }) }).catch(() => null);
  if (res?.ok && typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_EVENT));
  return Boolean(res?.ok);
}

export const PROFILE_CHANGED = PROFILE_EVENT;
