import { BRAND } from "@/config/brand";

// The source on GitHub. Until BRAND.repoUrl is set, links to it go to the open
// source section instead, which says the code is coming soon.
export const REPO_URL: string | null = BRAND.repoUrl || null;
export const REPO_HREF = REPO_URL ?? "/#open-source";
