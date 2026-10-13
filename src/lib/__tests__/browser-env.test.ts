import assert from "node:assert/strict";
import { test } from "node:test";
import { androidIntentUrl, inAppBrowserName, isAndroid, isIOS } from "../browser-env";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const ANDROID_INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; fr_FR; 649612398)";
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.47.109;]";
const ANDROID_THREADS =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Barcelona 349.0.0.40.100 Android";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 352.0.0.20.104 (iPhone15,2; iOS 18_0; fr_FR; fr; scale=3.00; 1179x2556; 649000000)";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

test("regular browsers are not in-app browsers", () => {
  assert.equal(inAppBrowserName(ANDROID_CHROME), null);
  assert.equal(inAppBrowserName(IPHONE_SAFARI), null);
  assert.equal(inAppBrowserName(IPAD_DESKTOP_MODE), null);
});

test("app browsers are recognised by name", () => {
  assert.equal(inAppBrowserName(ANDROID_INSTAGRAM), "Instagram");
  assert.equal(inAppBrowserName(IPHONE_INSTAGRAM), "Instagram");
  assert.equal(inAppBrowserName(ANDROID_FACEBOOK), "Facebook");
  assert.equal(inAppBrowserName(ANDROID_THREADS), "Threads");
  assert.equal(inAppBrowserName(ANDROID_WEBVIEW), "this app");
});

test("platforms", () => {
  assert.equal(isAndroid(ANDROID_CHROME), true);
  assert.equal(isAndroid(IPHONE_SAFARI), false);
  assert.equal(isIOS(IPHONE_SAFARI), true);
  assert.equal(isIOS(IPAD_DESKTOP_MODE, 5), true);
  assert.equal(isIOS(IPAD_DESKTOP_MODE, 0), false);
  assert.equal(isIOS(ANDROID_CHROME), false);
});

test("the Android intent link opens the same page in the phone's browser", () => {
  const url = "https://ags.joanacodes.workers.dev/r/tok_abc123?x=1";
  assert.equal(
    androidIntentUrl(url),
    "intent://ags.joanacodes.workers.dev/r/tok_abc123?x=1#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fags.joanacodes.workers.dev%2Fr%2Ftok_abc123%3Fx%3D1;end",
  );
});
