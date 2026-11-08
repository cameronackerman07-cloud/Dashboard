// Lets `node --test` run the TypeScript source directly: maps "@/..." to the
// project root, adds missing .ts extensions and stubs "server-only".
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withExt = (p) => [p, `${p}.ts`, `${p}.tsx`, path.join(p, "index.ts")].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    // Next ships CommonJS entry files without "exports", so add the .js.
    if (spec === "next/headers" || spec === "next/cache") return next(`${spec}.js`, ctx);
    // The end-to-end tick test swaps real push for a recorder.
    if (spec === "@/lib/push" && process.env.TEST_STUB_PUSH === "1") return { url: pathToFileURL(path.join(root, "tests/stubs/push.ts")).href, shortCircuit: true };
    if (spec.startsWith("@/")) {
      const f = withExt(path.join(root, spec.slice(2)));
      if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
      const f = withExt(fileURLToPath(new URL(spec, ctx.parentURL)));
      if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});
