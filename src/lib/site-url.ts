/**
 * Public origin of the app, e.g. https://whatsapp-ai-bot-xxxxx-uc.a.run.app.
 *
 * Deliberately NOT derived from the incoming request (req.nextUrl.origin /
 * req.url). Behind Cloud Run's proxy, the Next.js standalone server sees the
 * container's internal bind address instead of the public host, so
 * request-derived redirects resolve to something like http://0.0.0.0:8080
 * that the browser can't reach.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
