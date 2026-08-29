/**
 * PostCSS pipeline. Tailwind CSS v4 ships its own PostCSS plugin, which also handles
 * vendor prefixing, so autoprefixer is no longer needed.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
