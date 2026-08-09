import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redact(value: string) {
  return value.replace(uuidPattern, "[id]").replace(emailPattern, "[email]");
}

function sanitizedScreenName(pathname: string) {
  const cleanPath = pathname.split("?")[0] || "/";
  return cleanPath
    .split("/")
    .map((segment) => segment.replace(uuidPattern, ":id"))
    .join("/");
}

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  sendDefaultPii: false,
  enableNativeNagger: false,
  enableAutoSessionTracking: true,
  enableAutoPerformanceTracing: false,
  tracesSampleRate: 0,
  profilesSampleRate: 0,
  attachScreenshot: false,
  attachViewHierarchy: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  maxBreadcrumbs: 30,
  beforeSend(event) {
    if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
    }
    event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
      ...breadcrumb,
      message: breadcrumb.message ? redact(breadcrumb.message) : breadcrumb.message,
      data: undefined,
    }));
    return event;
  },
});

export const analytics = posthogKey
  ? new PostHog(posthogKey, {
      host: posthogHost,
      personProfiles: "identified_only",
      disableGeoip: true,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      errorTracking: { autocapture: false },
      flushAt: 20,
      flushInterval: 30_000,
    })
  : null;

let identifiedUserId: string | null = null;

export function identifyTelemetryUser(userId: string | null) {
  if (identifiedUserId === userId) return;
  identifiedUserId = userId;
  Sentry.setUser(userId ? { id: userId } : null);
  if (!analytics) return;
  if (userId) analytics.identify(userId);
  else void analytics.reset();
}

export function trackScreen(pathname: string) {
  if (!analytics) return;
  void analytics.screen(sanitizedScreenName(pathname));
}

export function captureAppError(error: unknown, context?: string) {
  Sentry.captureException(error, context ? { tags: { context } } : undefined);
  analytics?.captureException(error, context ? { context } : undefined);
}

export { Sentry };
