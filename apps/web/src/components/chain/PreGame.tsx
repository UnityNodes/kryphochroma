"use client";

import { DECK_SIZE, SETUP_STEPS } from "@kryphochroma/abi";
import { Armchair, Bot, Eye, Link2, Play, Shuffle, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { ChainSnapshot } from "@/chain/useChainGame";
import { AvatarGlyph, avatarColor } from "@/components/profile/Avatar";
import { ProfileChip } from "@/components/profile/ProfileChip";
import { useMyProfile } from "@/components/profile/useMyProfile";
import { useProfiles } from "@/components/profile/useProfiles";
import { WalletBar } from "@/components/wallet/WalletBar";
import { tableCode, tablePath } from "@/lib/invite";

export interface PreGameProps {
  readonly id: string;
  readonly snapshot: ChainSnapshot;
  readonly address: string;
  readonly watching: boolean;
  readonly onFill: () => void;
  readonly onStart: () => void;
  readonly onJoin: () => void;
  readonly working: boolean;
}

async function copyInvite(id: string): Promise<void> {
  const url = `${window.location.origin}${tablePath(id)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.message(url);
  }
}

export function PreGame({ id, snapshot, address, watching, onFill, onStart, onJoin, working }: PreGameProps) {
  const { table, seats } = snapshot;
  const profiles = useProfiles(seats.map((s) => s.session));
  const myProfile = useMyProfile();
  const free = (table.config.seats ?? seats.length) - seats.length;
  const canJoin = !watching && snapshot.me < 0 && free > 0;
  const stage = Number(table.stage);
  const isCreator = table.creator.toLowerCase() === address.toLowerCase();
  const progress = Math.round((Number(table.setupStep) / SETUP_STEPS) * 100);
  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <div className="kc-box relative z-10 col-[1/-1] row-[1/-1] mx-4 grid gap-4 place-self-center">
          {stage === 0 && (
            <>
              <h2>Table lobby</h2>
              <div className="font-display text-3xl tracking-wide text-sun">{tableCode(id)}</div>
              <p>
                <Users className="mr-1 inline size-4" aria-hidden />
                {seats.length} of {table.config.seats ?? seats.length} seats taken
              </p>
              <ol className="grid gap-2 text-left text-sm">
                {seats.map((s, i) => {
                  const profile = profiles[s.session.toLowerCase()];
                  const mine = i === snapshot.me || s.player.toLowerCase() === address.toLowerCase();
                  const label = profile?.name ?? `${s.player.slice(0, 6)}…${s.player.slice(-4)}`;
                  return (
                    <li key={s.player} className="flex items-center gap-2">
                      <span className="kc-avatar size-8 text-sm" style={{ "--c": avatarColor(profile?.avatar, "var(--muted)") } as React.CSSProperties} aria-hidden>
                        <AvatarGlyph avatar={profile?.avatar} letter={String(i + 1)} />
                      </span>
                      <span>
                        Seat {i + 1}: <b className="text-cream">{label}</b>
                        {mine && " (you)"}
                        {i === 0 && " · host"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {snapshot.me >= 0 && <ProfileChip profile={myProfile.profile} onSave={myProfile.update} />}
              {canJoin && <WalletBar disabled={working} />}
              <div className="flex flex-wrap justify-center gap-3">
                {canJoin && (
                  <button type="button" className="kc-btn kc-mono" onClick={onJoin} disabled={working}>
                    <Armchair aria-hidden />
                    Take a seat
                  </button>
                )}
                {!watching && free > 0 && snapshot.me >= 0 && (
                  <button type="button" className="kc-btn" onClick={onFill} disabled={working}>
                    <Bot aria-hidden />
                    Fill with bots
                  </button>
                )}
                {isCreator && !watching && (
                  <button type="button" className="kc-btn" onClick={onStart} disabled={working || seats.length < 2}>
                    <Play aria-hidden />
                    Start
                  </button>
                )}
              </div>
              {free > 0 && <p className="text-sm">Share the invite link: friends sit down as guests or with a wallet. {isCreator ? "Start when everyone is in, or fill the empty seats with bots." : "The host starts the game."}</p>}
              <div className="flex flex-wrap justify-center gap-3 text-sm">
                <button type="button" className="kc-chip" onClick={() => void copyInvite(id)}>
                  <Link2 aria-hidden />
                  Copy invite link
                </button>
                {!watching && (
                  <Link href={`/t/${id}/watch`} className="kc-chip">
                    <Eye aria-hidden />
                    Watch only
                  </Link>
                )}
              </div>
            </>
          )}
          {stage === 1 && (
            <>
              <h2>Shuffling on chain</h2>
              <p>
                <Shuffle className="mr-1 inline size-4" aria-hidden />
                Step {Number(table.setupStep)} of {SETUP_STEPS} · FHE.randEbool + FHE.select
              </p>
              <div className="h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-sun transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p>Nobody, not even the contract, knows the order of the {DECK_SIZE} cards.</p>
            </>
          )}
          {stage === 2 && (
            <>
              <h2>Dealing sealed cards</h2>
              <p>Each card is granted only to its owner with FHE.allow. The first discard is revealed with a KMS proof.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
