export const DISCLAIMER = "This project is not audited, endorsed or operated by Zama. Use at your own risk.";

export function Disclaimer({ className }: { readonly className?: string }) {
  return <p className={className}>{DISCLAIMER}</p>;
}
