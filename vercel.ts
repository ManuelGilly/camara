import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "next build",
  // Las funciones de signaling son cortas; subimos un poco el límite por si
  // un poll se demora mientras matchea.
  functions: {
    "app/api/**/route.ts": {
      maxDuration: 30,
    },
  },
};
