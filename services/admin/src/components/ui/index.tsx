import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Small shadcn-style primitives: plain elements plus Tailwind classes, owned by this repo.
// Colors come only from the semantic tokens in src/theme.css.

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  secondary: "border border-input bg-card text-foreground hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  ghost: "text-foreground hover:bg-muted",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "pr-8", className)} {...props} />;
}

// Callers associate the control through htmlFor.
export function Label({ className, ...props }: ComponentProps<"label">) {
  // biome-ignore lint/a11y/noLabelWithoutControl: generic wrapper; htmlFor comes from props
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border bg-card p-5 shadow-xs", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("mb-3 text-base font-semibold text-foreground", className)} {...props} />;
}

// Full class strings (not built from the tone name) so Tailwind can find them.
const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary text-primary-foreground",
  common: "bg-rarity-common/15 text-rarity-common",
  uncommon: "bg-rarity-uncommon/15 text-rarity-uncommon",
  rare: "bg-rarity-rare/15 text-rarity-rare",
  epic: "bg-rarity-epic/15 text-rarity-epic",
  legendary: "bg-rarity-legendary/15 text-rarity-legendary",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone, className, ...props }: ComponentProps<"span"> & { tone: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("border-b bg-muted/60 px-4 py-2 font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border/60 px-4 py-2 text-foreground", className)} {...props} />;
}

export function Alert({
  tone = "error",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "error" | "success" | "info" }) {
  const tones = {
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    success: "border-success/30 bg-success/10 text-success",
    info: "bg-muted/60 text-muted-foreground",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
