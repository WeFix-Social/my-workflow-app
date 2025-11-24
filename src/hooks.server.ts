import { sequence } from "@sveltejs/kit/hooks";
import * as Sentry from "@sentry/sveltekit";
import { error, json, redirect, text, type Handle } from "@sveltejs/kit";
// import { createServerClient } from "@supabase/ssr";
// import { requireAdminOrExpertAuth, isAdminRoute } from '$lib/admin/auth';
// import type { Database } from '$lib/supabase/types';
// import { retrieveImpersonation } from '$lib/impersonation/retrieve';
// import { impersonationCookieForToken, type Impersonation } from '$lib/impersonation/shared';
// import { supabaseProjectId } from '$lib/supabase/project';
// import { PostHog } from "posthog-node";

// import {
// 	PUBLIC_SUPABASE_URL,
// 	PUBLIC_SUPABASE_ANON_KEY,
// 	PUBLIC_POSTHOG_ID,
// } from '$env/static/public';

const shouldTrackErrors = import.meta.env.MODE !== "development";

// if (shouldTrackErrors) {
// 	Sentry.init({
// 		dsn: 'https://b40db5985021312e5823911b201defaf@o4508437671772160.ingest.de.sentry.io/4508437672165456',
// 		tracesSampleRate: 1,
// 		environment: import.meta.env.MODE,
// 	});
// }

// Helper function to capture exceptions in PostHog
async function captureExceptionInPostHog(error: unknown, userId?: string) {
  // if (!shouldTrackErrors) {
  // 	return;
  // }
  // const posthog = new PostHog(PUBLIC_POSTHOG_ID, {
  // 	host: 'https://eu.i.posthog.com',
  // });
  // try {
  // 	// Use userId as distinctId if available, otherwise use 'anonymous'
  // 	const distinctId = userId || 'anonymous';
  // 	// Capture exception event with the user's distinctId
  // 	posthog.capture({
  // 		distinctId,
  // 		event: '$exception',
  // 		properties: {
  // 			$exception_type: error instanceof Error ? error.name : 'Error',
  // 			$exception_message: error instanceof Error ? error.message : String(error),
  // 			$exception_stack: error instanceof Error ? error.stack : undefined,
  // 		},
  // 	});
  // 	await posthog.shutdown();
  // } catch (err) {
  // 	console.error('Failed to capture exception in PostHog:', err);
  // }
}

function isContentType(request: Request, ...types: string[]) {
  const type =
    request.headers.get("content-type")?.split(";", 1)[0].trim() ?? "";
  return types.includes(type.toLowerCase());
}
function isFormContentType(request: Request) {
  return isContentType(
    request,
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain"
  );
}

// Disable CORS for webhooks:
const webHookPath = "/api/webhooks";

const cors: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  // Suppress well-known Chrome DevTools requests
  if (url.pathname.startsWith("/.well-known/appspecific/com.chrome.devtools")) {
    return new Response(null, { status: 204 }); // Return empty response with 204 No Content
  }

  // Handle CSRF:
  // adapted from: https://github.com/sveltejs/kit/blob/main/packages/kit/src/runtime/server/respond.js#L63
  const forbidden =
    isFormContentType(request) &&
    (request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "PATCH" ||
      request.method === "DELETE") &&
    request.headers.get("origin") !== url.origin &&
    !url.pathname.startsWith(webHookPath);

  if (forbidden) {
    const message = `Cross-site ${request.method} form submissions are forbidden`;
    if (request.headers.get("accept") === "application/json") {
      return json({ message }, { status: 403 });
    }
    return text(message, { status: 403 });
  }

  // Apply CORS header for webhooks
  if (event.url.pathname.startsWith(webHookPath)) {
    // Required for CORS to work
    if (event.request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
  }

  const response = await resolve(event);
  if (event.url.pathname.startsWith("/api")) {
    response.headers.append("Access-Control-Allow-Origin", `*`);
  }
  return response;
};

// // Custom error handler that captures errors in both Sentry and PostHog
// export const handleError = Sentry.handleErrorWithSentry(
// 	async (input: { event: any; error: unknown; status: number; message: string }) => {
// 		// Try to extract user ID from the event
// 		let userId: string | undefined;
// 		try {
// 			if (input.event?.locals?.safeGetUser) {
// 				const { user } = await input.event.locals.safeGetUser();
// 				userId = user?.id;
// 			}
// 		} catch (err) {
// 			console.error('Failed to get user from event:', err);
// 		}

// 		// SvelteKit 2.0 offers a reliable way to check for a 404 error:
// 		if (input.status !== 404) {
// 			// Capture exception in PostHog (fire and forget, don't await)
// 			captureExceptionInPostHog(input.error, userId).catch((err) =>
// 				console.error('PostHog capture failed:', err),
// 			);
// 		}
// 	},
// );

const supabase: Handle = async ({ event, resolve }) => {
  //   let impersonation: Impersonation | null = null;
  //   const impersonationCookie = event.cookies.get(impersonationCookieForToken);
  //   if (impersonationCookie) {
  //     impersonation = retrieveImpersonation(impersonationCookie);
  //   }

  /**
   * Flag to track if cookies can still be set.
   * Once resolve() is called, cookies cannot be set anymore.
   */
  // let canSetCookies = true;

  /**
   * Helper function to check if an error is about response already generated
   */
  const isResponseGeneratedError = (error: unknown): boolean => {
    if (error instanceof Error) {
      return error.message.includes("after the response has been generated");
    }
    return false;
  };

  /**
   * Creates a Supabase client specific to this server request.
   *
   * The Supabase client gets the Auth token from the request cookies.
   */

  //   let headers = {};
  //   if (impersonation?.accessToken) {
  //     headers = {
  //       Authorization: `Bearer ${impersonation?.accessToken}`,
  //     };
  //   }

  //   event.locals.supabase = createServerClient<Database>(
  //     PUBLIC_SUPABASE_URL,
  //     PUBLIC_SUPABASE_ANON_KEY,
  //     {
  //       // The following does not work
  //       // accessToken: async () => impersonation?.accessToken ?? null,
  //       global: {
  //         headers,
  //       },

  //       cookies: {
  //         getAll: () => event.cookies.getAll(),
  //         /**
  //          * SvelteKit's cookies API requires `path` to be explicitly set in
  //          * the cookie options. Setting `path` to `/` replicates previous/
  //          * standard behavior.
  //          */
  //         setAll: (cookiesToSet) => {
  //           // Don't attempt to set cookies if response has already been generated
  //           // if (!canSetCookies) {
  //           // 	return;
  //           // }
  //           try {
  //             cookiesToSet.forEach(({ name, value, options }) => {
  //               event.cookies.set(name, value, { ...options, path: "/" });
  //             });
  //           } catch (error) {
  //             // Only log errors that are not about response already generated
  //             // to avoid noise in logs from expected async token refresh operations
  //             // if (!isResponseGeneratedError(error)) {
  //             console.error("Failed to set cookies:", error);
  //             // }
  //           }
  //         },
  //       },
  //     }
  //   );

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  //   event.locals.safeGetUser = async () => {
  //     if (impersonation) {
  //       return { user: impersonation.impersonatedUser };
  //     }

  //     const {
  //       data: { session },
  //     } = await event.locals.supabase.auth.getSession();
  //     if (!session) {
  //       return { user: null };
  //     }

  //     const {
  //       data: { user },
  //       error,
  //     } = await event.locals.supabase.auth.getUser();
  //     if (error) {
  //       // JWT validation has failed
  //       return { user: null };
  //     }

  //     return { user };
  //   };

  // Admin User Supabase client:
  // TODO: centralize it somewhere:

  //   const adminAuthCookieName = `admin-auth-token-${supabaseProjectId}`;

  //   event.locals.adminSupabase = createServerClient<Database>(
  //     PUBLIC_SUPABASE_URL,
  //     PUBLIC_SUPABASE_ANON_KEY,
  //     {
  //       cookieOptions: {
  //         name: adminAuthCookieName,
  //       },
  //       cookies: {
  //         getAll: () => event.cookies.getAll(),
  //         /**
  //          * SvelteKit's cookies API requires `path` to be explicitly set in
  //          * the cookie options. Setting `path` to `/` replicates previous/
  //          * standard behavior.
  //          */
  //         setAll: (cookiesToSet) => {
  //           // Don't attempt to set cookies if response has already been generated
  //           // if (!canSetCookies) {
  //           // 	return;
  //           // }
  //           try {
  //             cookiesToSet.forEach(({ name, value, options }) => {
  //               event.cookies.set(name, value, { ...options, path: "/" });
  //             });
  //           } catch (error) {
  //             // Only log errors that are not about response already generated
  //             // to avoid noise in logs from expected async token refresh operations
  //             // if (!isResponseGeneratedError(error)) {
  //             console.error("Failed to set cookies:", error);
  //             // }
  //           }
  //         },
  //       },
  //     }
  //   );

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  //   event.locals.adminSafeGetSession = async () => {
  //     const {
  //       data: { session },
  //     } = await event.locals.adminSupabase.auth.getSession();
  //     if (!session) {
  //       return { session: null, user: null };
  //     }

  //     const {
  //       data: { user },
  //       error,
  //     } = await event.locals.adminSupabase.auth.getUser();
  //     if (error) {
  //       // JWT validation has failed
  //       return { session: null, user: null };
  //     }

  //     return { session, user };
  //   };

  // Set flag to false before resolving to prevent post-response cookie setting
  // canSetCookies = false;
  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      /**
       * Supabase libraries use the `content-range` and `x-supabase-api-version`
       * headers, so we need to tell SvelteKit to pass it through.
       */
      return name === "content-range" || name === "x-supabase-api-version";
    },
  });
};

export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin") && pathname !== "/admin/login";
}

export async function requireAdminOrExpertAuth(locals: App.Locals) {
  throw error(401, "Unauthorized - not implemented!");
}

const authGuard: Handle = async ({ event, resolve }) => {
  // const { session, user } = await event.locals.adminSafeGetSession();
  // event.locals.session = session;
  // event.locals.user = user;

  // Handle admin route protection
  if (isAdminRoute(event.url.pathname)) {
    // requireAdminOrExpertAuth throws error if it fails
    try {
      const authResult = await requireAdminOrExpertAuth(event.locals);
      // Store authenticated admin/expert user in locals for use in layout
      // Normalize both admin and expert results to adminUser/adminSession
      // if ('adminUser' in authResult) {
      // 	event.locals.adminUser = authResult.adminUser;
      // 	event.locals.adminSession = authResult.adminSession;
      // } else {
      // 	event.locals.adminUser = authResult.expertUser;
      // 	event.locals.adminSession = authResult.expertSession;
      // }
    } catch (error) {
      console.error("Admin/Expert auth error:", error);
      throw redirect(303, "/admin/login");
    }
  }

  return resolve(event);
};

export const handle: Handle = sequence(
  Sentry.sentryHandle(),
  cors,
  supabase,
  authGuard
);
