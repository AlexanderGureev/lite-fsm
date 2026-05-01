import * as React from "react";

import { cn } from "@/lib/utils";

type GradientTextProps<E extends React.ElementType = "span"> = {
  as?: E;
  backdrop?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<E>, "as" | "children" | "className">;

function GradientText<E extends React.ElementType = "span">({
  as,
  backdrop = true,
  className,
  children,
  ...props
}: GradientTextProps<E>) {
  const Component = (as ?? "span") as React.ElementType;

  return (
    <Component
      className={cn("relative inline-block align-baseline", className)}
      {...props}
    >
      {backdrop ? (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-0.3em 0",
            backdropFilter: "saturate(135%) blur(18px)",
            WebkitBackdropFilter: "saturate(135%) blur(18px)",
            maskImage:
              "radial-gradient(ellipse 95% 70% at 50% 50%, #000 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.4) 75%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 95% 70% at 50% 50%, #000 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.4) 75%, transparent 100%)",
          }}
        />
      ) : null}
      <span className="lite-fsm-gradient-text relative inline-block font-display font-bold">
        {children}
      </span>
    </Component>
  );
}

export { GradientText };
