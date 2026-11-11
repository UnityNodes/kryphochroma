"use client";

import { AVATAR_COLORS, AVATAR_ICONS, NAME_MAX, type Profile, avatarOf, cleanName, parseAvatar } from "@kryphochroma/abi";
import { CARD_COLORS } from "@kryphochroma/cards";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { randomAvatar } from "@/chain/profile";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AVATAR_GLYPHS, AvatarGlyph, avatarColor } from "./Avatar";

export interface ProfileChipProps {
  readonly profile: Profile | null;
  readonly onSave: (profile: Profile) => Promise<boolean>;
}

export function ProfileChip({ profile, onSave }: ProfileChipProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? randomAvatar());
  const [saving, setSaving] = useState(false);
  const parsed = parseAvatar(avatar);
  const clean = cleanName(name);

  const show = () => {
    setName(profile?.name ?? "");
    setAvatar(profile?.avatar ?? randomAvatar());
    setOpen(true);
  };

  const save = async () => {
    if (!clean) return;
    setSaving(true);
    const shared = await onSave({ name: clean, avatar });
    setSaving(false);
    setOpen(false);
    if (!shared) toast.message("Saved on this device. Others will see it once you sit at a table.");
  };

  return (
    <>
      <button type="button" className="kc-chip min-h-11 justify-self-center" onClick={show} aria-label={profile ? `Your profile: ${profile.name}, edit` : "Choose your name and avatar"}>
        <span className="kc-avatar size-7 text-sm" style={{ "--c": avatarColor(profile?.avatar, "var(--y)") } as React.CSSProperties}>
          <AvatarGlyph avatar={profile?.avatar} letter="?" />
        </span>
        {profile ? profile.name : "Choose your name"}
        <Pencil aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="kc-box max-h-[90dvh] overflow-auto border-2 border-cream bg-ink text-left sm:max-w-[440px]">
          <DialogTitle className="font-display text-[30px] font-normal text-sun">Your profile</DialogTitle>
          <DialogDescription className="text-muted">Everyone at your table sees this name and avatar. It lives on our server, not on chain, and is signed by your session key.</DialogDescription>
          <div className="flex items-center gap-3">
            <span className="kc-avatar size-14 text-2xl" style={{ "--c": avatarColor(avatar, "var(--y)") } as React.CSSProperties} aria-hidden>
              <AvatarGlyph avatar={avatar} letter="?" />
            </span>
            <label className="grid flex-1 gap-1 text-sm">
              <span className="text-muted">Name</span>
              <input
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl border-2 border-cream/40 bg-black/30 px-3 text-cream focus:border-sun focus:outline-none"
                placeholder="2 to 16 letters"
                aria-invalid={name.length > 0 && !clean}
              />
            </label>
          </div>
          {name.length > 0 && !clean && <p className="text-sm text-red">Use 2 to 16 letters, digits, spaces, dots, dashes or underscores.</p>}
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar">
            {AVATAR_ICONS.map((icon) => {
              const Glyph = AVATAR_GLYPHS[icon];
              return (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={parsed?.icon === icon}
                  aria-label={icon}
                  onClick={() => setAvatar(avatarOf(icon, parsed?.color ?? 0))}
                  className={cn("grid size-11 place-items-center rounded-full border-2 text-cream", parsed?.icon === icon ? "border-sun bg-sun/20" : "border-cream/30")}
                >
                  <Glyph className="size-5" aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Colour">
            {Array.from({ length: AVATAR_COLORS }, (_, c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={parsed?.color === c}
                aria-label={CARD_COLORS[c]?.name ?? `Colour ${c + 1}`}
                onClick={() => setAvatar(avatarOf(parsed?.icon ?? "cat", c))}
                className={cn("size-11 rounded-full border-2", parsed?.color === c ? "border-cream ring-2 ring-sun" : "border-cream/30")}
                style={{ background: CARD_COLORS[c]?.base }}
              />
            ))}
          </div>
          <button type="button" className="kc-btn kc-mono justify-center" onClick={save} disabled={!clean || saving}>
            Save
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
