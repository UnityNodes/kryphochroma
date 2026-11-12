"use client";

import { DECK_SIZE, SETUP_STEPS } from "@kryphochroma/abi";
import { Armchair, Bot, Eye, Link2, Loader2, LogOut, Play, Shuffle, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { ChainSnapshot } from "@/chain/useChainGame";
import { AvatarGlyph, avatarColor } from "@/components/profile/Avatar";
import { ProfileChip } from "@/components/profile/ProfileChip";
import { useMyProfile } from "@/components/profile/useMyProfile";
import { useProfiles } from "@/components/profile/useProfiles";
import { PageShell } from "@/components/site/PageShell";
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
  readonly onLeave: () => void;
  readonly working: boolean;
  readonly joining: boolean;
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

export function PreGame({ id, snapshot, address, watching, onFill, onStart, onJoin, onLeave, working, joining }: PreGameProps) {
  const { table, seats } = snapshot;
  const profiles = useProfiles(seats.map((s) => s.session));
  const myProfile = useMyProfile();
  const free = (table.config.seats ?? seats.length) - seats.length;
  const pending = !watching && joining && snapshot.me < 0;
  const canJoin = !watching && snapshot.me < 0 && free > 0 && !pending;
  const stage = Number(table.stage);
  const creator = table.creator.toLowerCase();
  const creatorSeat = seats.findIndex((s) => s.player.toLowerCase() === creator || s.session.toLowerCase() === creator);
  const hostSeat = creatorSeat >= 0 ? creatorSeat : 0;
  const isCreator = creator === address.toLowerCase() || (snapshot.me >= 0 && snapshot.me === hostSeat);
  const seated = !watching && snapshot.me >= 0;
  const canStart = seated && (isCreator || free === 0);
  const progress = Math.round((Number(table.setupStep) / SETUP_STEPS) * 100);
  return (
    <PageShell>
      <div className="grid flex-1 place-items-center px-4 py-8 sm:py-14">
        <div className="kc-box grid gap-4" style={{ maxWidth: 420 }}>
          {stage === 0 && (
            <>
              <div className="grid gap-1">
                <h1 className="font-display text-4xl leading-none tracking-wide text-sun">{tableCode(id)}</h1>
                <p className="flex items-center justify-center gap-1">
                  <Users className="size-4" aria-hidden />
                  Table lobby · {seats.length} of {table.config.seats ?? seats.length} seats taken
                </p>
              </div>
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
                        {i === hostSeat && " · host"}
                      </span>
                    </li>
                  );
                })}
                {pending && (
                  <li className="flex items-center gap-2" aria-live="polite">
                    <span className="kc-avatar size-8 text-sm" style={{ "--c": avatarColor(myProfile.profile?.avatar, "var(--y)") } as React.CSSProperties} aria-hidden>
                      <AvatarGlyph avatar={myProfile.profile?.avatar} letter={String(seats.length + 1)} />
                    </span>
                    <span>
                      Seat {seats.length + 1}: <b className="text-cream">{myProfile.profile?.name ?? "You"}</b> (you) · sitting down on Sepolia
                      <Loader2 className="ml-1 inline size-4 animate-spin" aria-hidden />
                    </span>
                  </li>
                )}
              </ol>
              {(snapshot.me >= 0 || pending) && <ProfileChip profile={myProfile.profile} onSave={myProfile.update} />}
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
                {canStart && (
                  <button type="button" className="kc-btn" onClick={onStart} disabled={working || seats.length < 2}>
                    <Play aria-hidden />
                    Start
                  </button>
                )}
              </div>
              {free > 0 && <p className="text-sm">Share the invite link: friends sit down as guests or with a wallet. The game starts by itself when the last seat is taken{isCreator ? ", or start earlier and fill the empty seats with bots." : "."}</p>}
              <div className="flex flex-wrap justify-center gap-3 text-sm">
                {seated && (
                  <button type="button" className="kc-chip min-h-11" onClick={onLeave} disabled={working}>
                    <LogOut aria-hidden />
                    Leave table
                  </button>
                )}
                <button type="button" className="kc-chip min-h-11" onClick={() => void copyInvite(id)}>
                  <Link2 aria-hidden />
                  Copy invite link
                </button>
                {!watching && (
                  <Link href={`/t/${id}/watch`} className="kc-chip min-h-11">
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
      </div>
    </PageShell>
  );
}
