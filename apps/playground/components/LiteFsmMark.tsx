import type { SVGProps } from "react";

export function LiteFsmMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      {...props}
    >
      <circle cx="5" cy="12" r="3" fill="currentColor" stroke="none" />
      <path d="M8.5 12h7" />
      <circle cx="19" cy="12" r="3" />
    </svg>
  );
}
