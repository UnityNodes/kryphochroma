import { type AvatarIcon, parseAvatar } from "@kryphochroma/abi";
import { CARD_COLORS } from "@kryphochroma/cards";
import { Bird, Cat, Crown, Dog, Fish, Flame, Ghost, type LucideIcon, Moon, Rabbit, Rocket, Squirrel, Turtle } from "lucide-react";

export const AVATAR_GLYPHS: Record<AvatarIcon, LucideIcon> = {
  cat: Cat,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  rabbit: Rabbit,
  turtle: Turtle,
  squirrel: Squirrel,
  ghost: Ghost,
  crown: Crown,
  rocket: Rocket,
  flame: Flame,
  moon: Moon,
};

export function avatarColor(avatar: string | null | undefined, fallback: string): string {
  const parsed = avatar ? parseAvatar(avatar) : null;
  return parsed ? (CARD_COLORS[parsed.color]?.base ?? fallback) : fallback;
}

export function AvatarGlyph({ avatar, letter }: { readonly avatar: string | null | undefined; readonly letter: string }) {
  const parsed = avatar ? parseAvatar(avatar) : null;
  if (!parsed) return <>{letter}</>;
  const Glyph = AVATAR_GLYPHS[parsed.icon];
  return <Glyph aria-hidden className="size-[55%]" strokeWidth={2.4} />;
}
