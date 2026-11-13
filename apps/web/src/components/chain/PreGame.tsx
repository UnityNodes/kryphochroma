"use client";

import { DECK_SIZE, SETUP_STEPS } from "@kryphochroma/abi";
import { Armchair, Bot, Eye, Link2, Loader2, LogOut, Play, Shuffle, Users } from "lucide-react";
import { cardBack, sharedDefs } from "@kryphochroma/cards";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ChainSnapshot } from "@/chain/useChainGame";
import { AvatarGlyph, avatarColor } from "@/components/profile/Avatar";
import { ProfileChip } from "@/components/profile/ProfileChip";
import { useMyProfile } from "@/components/profile/useMyProfile";
import { useProfiles } from "@/components/profile/useProfiles";
import { WaitHint } from "@/components/table/ChainProgress";
import { PageShell } from "@/components/site/PageShell";
import { WalletBar } from "@/components/wallet/WalletBar";
import { tableCode, tablePath } from "@/lib/invite";
import { cn } from "@/lib/utils";

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
  if (stage !== 0) return <SetupScreen id={id} stage={stage} step={Number(table.setupStep)} progress={progress} />;
  return (
    <PageShell>
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-8 px-4 pt-8 pb-16 sm:px-6 lg:pt-12">
        <div className="grid gap-3">
          <h1 className="font-display text-6xl leading-[.88] tracking-wide text-sun [text-shadow:3px_3px_0_var(--color-red),6px_6px_0_var(--color-ink)] sm:text-7xl">{tableCode(id)}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-cream/75">
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              {seats.length} of {table.config.seats ?? seats.length} seats taken
            </span>
            <span className="flex items-center gap-1.5">
              <Shuffle className="size-4 text-teal" aria-hidden />
              {Number(table.setupStep) >= SETUP_STEPS ? "Cards already drawn on chain" : `Drawing cards on chain, step ${Number(table.setupStep)} of ${SETUP_STEPS}`}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="kc-panel grid grid-cols-1 gap-6 p-6 sm:p-8" aria-labelledby="seats-title">
            <h2 id="seats-title" className="font-display text-4xl leading-none text-sun">
              Seats
            </h2>
            <ol className="grid gap-3 sm:grid-cols-2">
              {seats.map((s, i) => {
                const profile = profiles[s.session.toLowerCase()];
                const mine = i === snapshot.me || s.player.toLowerCase() === address.toLowerCase();
                const label = profile?.name ?? `${s.player.slice(0, 6)}…${s.player.slice(-4)}`;
                const tags = [mine && "you", i === hostSeat && "host"].filter(Boolean).join(" · ");
                return <SeatTile key={s.player} n={i + 1} name={label} tags={tags} avatar={profile?.avatar} mine={mine} />;
              })}
              {pending && <SeatTile n={seats.length + 1} name={myProfile.profile?.name ?? "You"} tags="you · sitting down" avatar={myProfile.profile?.avatar} mine busy />}
              {Array.from({ length: Math.max(0, free - (pending ? 1 : 0)) }, (_, k) => (
                <li key={`free-${k}`} className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-dashed border-cream/20 px-4 text-cream/55">
                  <span className="grid size-10 place-items-center rounded-full border-2 border-dashed border-cream/25 font-display text-lg">{seats.length + (pending ? 1 : 0) + k + 1}</span>
                  Open seat
                </li>
              ))}
            </ol>
            {pending && (
              <WaitHint note={{ title: "Taking your seat on Sepolia", why: "You signed your seat and our relayer put it into a transaction, so you pay nothing. It counts once it is in a block, about 12 s, and the cards are dealt encrypted in that same block." }} />
            )}
            {(snapshot.me >= 0 || pending) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-cream/70">
                Your name at the table
                <ProfileChip profile={myProfile.profile} onSave={myProfile.update} />
              </div>
            )}
            {canJoin && <WalletBar disabled={working} />}
            <div className="flex flex-wrap gap-3 empty:hidden">
              {canJoin && (
                <button type="button" className="kc-btn kc-mono h-14 px-7 text-2xl" onClick={onJoin} disabled={working}>
                  <Armchair aria-hidden />
                  Take a seat
                </button>
              )}
              {canStart && (
                <button type="button" className="kc-btn kc-mono h-14 px-7 text-2xl" onClick={onStart} disabled={working || seats.length < 2}>
                  <Play aria-hidden />
                  Start
                </button>
              )}
              {!watching && free > 0 && snapshot.me >= 0 && (
                <button type="button" className="kc-btn h-14" onClick={onFill} disabled={working}>
                  <Bot aria-hidden />
                  Fill with bots
                </button>
              )}
            </div>
          </section>
          <InvitePanel id={id} free={free} isCreator={isCreator} seated={seated} watching={watching} working={working} onLeave={onLeave} />
        </div>
      </div>
    </PageShell>
  );
}

function SeatTile({ n, name, tags, avatar, mine, busy }: { readonly n: number; readonly name: string; readonly tags: string; readonly avatar?: string; readonly mine: boolean; readonly busy?: boolean }) {
  return (
    <li className={cn("flex min-h-[72px] items-center gap-3 rounded-2xl border-2 px-4 py-3", mine ? "border-sun bg-sun/10" : "border-cream/20 bg-black/20")} aria-live={busy ? "polite" : undefined}>
      <span className="kc-avatar size-10 text-lg" style={{ "--c": avatarColor(avatar, "var(--muted)") } as React.CSSProperties} aria-hidden>
        <AvatarGlyph avatar={avatar} letter={String(n)} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate font-semibold text-cream">{name}</b>
        <span className="flex items-center gap-1 text-xs text-cream/60">
          Seat {n}
          {tags && ` · ${tags}`}
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        </span>
      </span>
    </li>
  );
}

interface InviteProps {
  readonly id: string;
  readonly free: number;
  readonly isCreator: boolean;
  readonly seated: boolean;
  readonly watching: boolean;
  readonly working: boolean;
  readonly onLeave: () => void;
}

function InvitePanel({ id, free, isCreator, seated, watching, working, onLeave }: InviteProps) {
  const path = tablePath(id);
  const [host, setHost] = useState("");
  useEffect(() => setHost(window.location.host), []);
  return (
    <section className="kc-panel grid grid-cols-1 content-start gap-5 p-6 sm:p-8" aria-labelledby="invite-title">
      <h2 id="invite-title" className="font-display text-4xl leading-none text-sun">
        Invite
      </h2>
      <div className="flex items-center gap-2 rounded-2xl border border-cream/20 bg-black/30 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-cream/85">{host}{path}</span>
        <button type="button" className="kc-chip kc-chip-on min-h-11 shrink-0 px-4" onClick={() => void copyInvite(id)}>
          <Link2 aria-hidden />
          Copy
        </button>
      </div>
      <p className="text-sm leading-relaxed text-cream/70">
        {free > 0
          ? `Friends sit down as guests or with a wallet. The game starts by itself when the last seat is taken${isCreator ? ", or start earlier and bots take the empty seats." : "."}`
          : "Every seat is taken. The game is about to start."}
      </p>
      <div className="flex flex-wrap gap-2 border-t border-cream/10 pt-5">
        {!watching && (
          <Link href={`/t/${id}/watch`} className="kc-chip min-h-11 px-4">
            <Eye aria-hidden />
            Watch only
          </Link>
        )}
        {seated && (
          <button type="button" className="kc-chip min-h-11 px-4" onClick={onLeave} disabled={working}>
            <LogOut aria-hidden />
            Leave table
          </button>
        )}
      </div>
    </section>
  );
}

const RIFFLE = [
  { r: -10, dx: "-34%", seed: "0x1f2e3d4c" },
  { r: 4, dx: "30%", seed: "0x5b6a7988" },
  { r: -2, dx: "-18%", seed: "0x9c8d7e6f" },
  { r: 9, dx: "22%", seed: "0x42424242" },
] as const;

function SetupScreen({ id, stage, step, progress }: { readonly id: string; readonly stage: number; readonly step: number; readonly progress: number }) {
  const shuffling = stage === 1;
  return (
    <PageShell>
      <div className="grid flex-1 place-items-center px-4 py-10">
        <section className="kc-panel kc-felt grid w-full max-w-[520px] justify-items-center gap-5 p-6 text-center sm:p-10" aria-live="polite">
          <div className="kc-riffle relative h-44 w-full" aria-hidden>
            <div className="absolute size-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
            {RIFFLE.map((c, i) => (
              <div
                key={c.seed}
                className="absolute top-1/2 left-1/2 w-24 drop-shadow-[6px_8px_0_rgba(0,0,0,.45)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                style={{ "--r": `${c.r}deg`, "--dx": c.dx, animationDelay: `${i * -0.35}s`, transform: `translate(-50%, -50%) rotate(${c.r}deg)` } as React.CSSProperties}
                dangerouslySetInnerHTML={{ __html: cardBack(c.seed) }}
              />
            ))}
          </div>
          <h1 className="font-display text-5xl leading-none text-cream">{shuffling ? "Drawing cards on chain" : "Dealing sealed cards"}</h1>
          <p className="text-sm text-cream/60">{tableCode(id)}</p>
          {shuffling ? (
            <>
              <div className="h-3 w-full overflow-hidden rounded-full bg-black/40" role="progressbar" aria-label="Draw progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full origin-left bg-sun transition-transform duration-500" style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
              <p className="flex items-center gap-2 text-sm text-cream/80">
                <Shuffle className="size-4 text-sun" aria-hidden />
                Step {step} of {SETUP_STEPS} · FHE.randEuint16 scaled to a full deck
              </p>
              <p className="max-w-[44ch] text-sm leading-relaxed text-cream/65">Nobody, not even the contract, knows the order of the {DECK_SIZE} cards.</p>
            </>
          ) : (
            <p className="max-w-[44ch] text-sm leading-relaxed text-cream/75">Each card is granted only to its owner with FHE.allow. The first discard opens with a KMS proof.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
