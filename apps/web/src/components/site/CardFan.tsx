import { sharedDefs } from "@kryphochroma/cards";
import { cn } from "@/lib/utils";

export interface FanCard {
  readonly svg: string;
  readonly rotate: number;
  readonly x: string;
  readonly y: string;
}

export function CardFan({ cards, className, cardClassName }: { readonly cards: readonly FanCard[]; readonly className?: string; readonly cardClassName?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden>
      <div className="absolute size-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
      {cards.map((card, i) => (
        <div
          key={i}
          className={cn("kc-fan-card absolute top-1/2 left-1/2 drop-shadow-[8px_10px_0_rgba(0,0,0,.45)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full", cardClassName ?? "w-[40%]")}
          style={{ zIndex: i + 1, transform: `translate(calc(-50% + ${card.x}), calc(-50% + ${card.y})) rotate(${card.rotate}deg)`, animationDelay: `${i * -1.6}s` }}
          dangerouslySetInnerHTML={{ __html: card.svg }}
        />
      ))}
    </div>
  );
}
