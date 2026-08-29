// eslint-config-next v16 ships a native ESLint flat-config array (core-web-vitals +
// TypeScript rules). Import and spread it directly. Do NOT wrap it in FlatCompat: that
// re-processes an already-flat config and crashes under ESLint 10.
import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "out/**", "next-env.d.ts"] },
];

export default config;
