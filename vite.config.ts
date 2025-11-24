import { defineConfig, loadEnv } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { sentrySvelteKit } from "@sentry/sveltekit";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { workflowPlugin } from "workflow/sveltekit";

export default defineConfig(({ mode, command }) => {
  // Load env for the current mode: .env, .env.[mode], .env.local, .env.[mode].local
  const env = loadEnv(mode, process.cwd(), ""); // '' = include all keys, not just PUBLIC_
  Object.assign(process.env, env); // let plugins read from process.env

  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

  // Only enforce Sentry token when doing a production *build* (when sourcemaps upload happens)
  if (command === "build" && mode === "production" && !sentryAuthToken) {
    throw new Error("SENTRY_AUTH_TOKEN is not set");
  }

  return {
    plugins: [
      // Include the Sentry plugin always; it will use the token when present.
      sentrySvelteKit({
        sourceMapsUploadOptions: {
          org: "wefix-social",
          project: "javascript-sveltekit",
          authToken: sentryAuthToken, // ok to be undefined during dev
        },
      }),
      sveltekit(),
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/scanbot-web-sdk/bundle/bin/document-scanner/*",
            dest: "wasm",
          },
        ],
        structured: false,
      }),
      workflowPlugin(),
    ],
    assetsInclude: ["**/*.docx"],
    server: {
      allowedHosts: ["shortly-helping-lioness.ngrok.app"],
    },
  };
});
