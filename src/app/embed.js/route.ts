import { appUrl } from "@/config/brand";
import { buildEmbedScript } from "@/lib/widget/embed-script";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildEmbedScript(new URL(appUrl()).origin), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "access-control-allow-origin": "*",
    },
  });
}
