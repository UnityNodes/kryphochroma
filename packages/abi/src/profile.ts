export const AVATAR_ICONS = ["cat", "dog", "bird", "fish", "rabbit", "turtle", "squirrel", "ghost", "crown", "rocket", "flame", "moon"] as const;
export type AvatarIcon = (typeof AVATAR_ICONS)[number];
export const AVATAR_COLORS = 5;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

export interface Profile {
  readonly name: string;
  readonly avatar: string;
}

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX || !NAME_PATTERN.test(name)) return null;
  return name;
}

export function avatarOf(icon: AvatarIcon, color: number): string {
  return `${icon}-${color}`;
}

export function parseAvatar(avatar: string): { readonly icon: AvatarIcon; readonly color: number } | null {
  const match = /^([a-z]+)-(\d)$/.exec(avatar);
  if (!match) return null;
  const icon = match[1] as AvatarIcon;
  const color = Number(match[2]);
  if (!AVATAR_ICONS.includes(icon) || color >= AVATAR_COLORS) return null;
  return { icon, color };
}

export function validProfile(raw: { readonly name?: unknown; readonly avatar?: unknown }): Profile | null {
  if (typeof raw.name !== "string" || typeof raw.avatar !== "string") return null;
  const name = cleanName(raw.name);
  if (!name || !parseAvatar(raw.avatar)) return null;
  return { name, avatar: raw.avatar };
}

export const BOT_PROFILES: readonly Profile[] = [
  { name: "Mira", avatar: "bird-2" },
  { name: "Delta", avatar: "rocket-3" },
  { name: "Orin", avatar: "dog-0" },
];
export const STAND_IN_PROFILE: Profile = { name: "Stand-in bot", avatar: "ghost-4" };

export function profileMessage(profile: Profile): string {
  return `Kryphochroma profile\nname: ${profile.name}\navatar: ${profile.avatar}`;
}
