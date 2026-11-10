import { cardBack, cardFace } from "@kryphochroma/cards";
import { useMemo } from "react";

export function CardFace({ card, colorBlind }: { readonly card: number; readonly colorBlind: boolean }) {
  const html = useMemo(() => cardFace(card, { colorBlind }), [card, colorBlind]);
  return <div className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CardBack({ handle }: { readonly handle?: string }) {
  const html = useMemo(() => cardBack(handle), [handle]);
  return <div className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}
