import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const number = new Intl.NumberFormat();

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatNumber = (n: number) => number.format(n);
