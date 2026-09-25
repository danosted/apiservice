import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom theme utilities (src/theme/tokens.css). Otherwise it
// mistakes e.g. `border-frame` for a border color and drops it next to `border-input`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "border-w": ["border-frame"],
      shadow: [{ shadow: ["panel", "control"] }],
      rounded: [{ rounded: ["pill"] }],
      "font-family": [{ font: ["display"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const number = new Intl.NumberFormat();

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatNumber = (n: number) => number.format(n);
