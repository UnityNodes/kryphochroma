export interface BackTarget {
  readonly href: string;
  readonly label: string;
}

export function backTarget(path: string): BackTarget | null {
  if (path === "/" || path === "") return null;
  if (path.startsWith("/docs/")) return { href: "/docs", label: "Docs" };
  if (path.startsWith("/j/") || path.startsWith("/t/")) return { href: "/new", label: "Tables" };
  return { href: "/", label: "Home" };
}
