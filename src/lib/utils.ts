import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with conflict resolution.
 * Used by shadcn/ui-style components throughout the app.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
