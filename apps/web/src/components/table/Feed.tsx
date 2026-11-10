import { Activity, CircleSlash, Eye, Layers, Lock, Megaphone, Shuffle, Swords, Trophy } from "lucide-react";
import type { FeedLine } from "@/game/offline";

const ICONS = { play: Eye, draw: Layers, pass: CircleSlash, mono: Megaphone, challenge: Swords, lock: Lock, trophy: Trophy, shuffle: Shuffle } as const;

export function Feed({ lines, title }: { readonly lines: readonly FeedLine[]; readonly title: string }) {
  return (
    <aside className="kc-feed" aria-label={title}>
      <h3>
        <Activity aria-hidden />
        {title}
      </h3>
      <ol>
        {lines.map((line, i) => {
          const Icon = ICONS[line.icon];
          return (
            <li key={lines.length - i}>
              <Icon aria-hidden />
              <div>
                {line.text}
                <small>{line.sub}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
