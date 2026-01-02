import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** @example cn("px-2 py-1", focused && "ring-2", "px-4") // => "py-1 ring-2 px-4" */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}