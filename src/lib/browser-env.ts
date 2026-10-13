/**
 * What kind of browser the page is running in, from the user agent.
 *
 * Apps like Instagram open links in their own built-in browser. Those can't
 * save files (on Android the download silently does nothing), so the readee
 * page asks people to open the link in their real browser instead.
 *
 * Pure functions, unit-tested.
 */

const IN_APP_BROWSERS: readonly { name: string; pattern: RegExp }[] = [
  { name: "Instagram", pattern: /Instagram/i },
  { name: "Threads", pattern: /Barcelona/ },
  { name: "Messenger", pattern: /Messenger|FBAN\/MessengerForiOS/i },
  { name: "Facebook", pattern: /FBAN|FBAV|FB_IAB|FBIOS/ },
  { name: "TikTok", pattern: /TikTok|musical_ly|BytedanceWebview|trill/i },
  { name: "Snapchat", pattern: /Snapchat/i },
  { name: "LinkedIn", pattern: /LinkedInApp/i },
  { name: "LINE", pattern: /\bLine\//i },
  { name: "Pinterest", pattern: /Pinterest/i },
];

/** The app whose built-in browser this is, or null in a regular browser. */
export function inAppBrowserName(userAgent: string): string | null {
  for (const { name, pattern } of IN_APP_BROWSERS) {
    if (pattern.test(userAgent)) return name;
  }
  // Any other Android app showing the page in a WebView.
  if (/Android/.test(userAgent) && /; wv\)/.test(userAgent)) return "this app";
  return null;
}

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/** iPhone, iPod or iPad (iPadOS presents itself as a Mac with a touch screen). */
export function isIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * An Android link that opens `url` in the phone's own browser, even from an
 * app's built-in browser; falls back to the plain URL where intents are not
 * supported.
 */
export function androidIntentUrl(url: string): string {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  const rest = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return `intent://${rest}#Intent;scheme=${scheme};S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
