import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      // Tighter at 360px than the old flat 1.5rem, which ate 48px of a
      // 360px screen before any content was drawn.
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1360px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          subtle: "hsl(var(--primary-subtle))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          /** Tinted fill for badges, callouts and icon badges. */
          subtle: "hsl(var(--destructive-subtle))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          /** Tinted fill for badges, callouts and icon badges. */
          subtle: "hsl(var(--success-subtle))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          /** Tinted fill for badges, callouts and icon badges. */
          subtle: "hsl(var(--warning-subtle))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          /** Tinted fill for badges, callouts and icon badges. */
          subtle: "hsl(var(--info-subtle))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          subtle: "hsl(var(--brand-subtle))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      // Bound to the CSS variables so light and dark get different weights
      // without any component needing to know which theme is active.
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      /**
       * Named type scale.
       *
       * **Added, never overridden.** Tailwind's own `text-sm`/`text-base` keys
       * are left exactly as they are, because ~150 existing usages depend on
       * them and redefining a key would silently resize the whole app. These
       * are new names that those usages can migrate onto page by page.
       *
       * The scale exists because the sizes had drifted: 21 hand-written pixel
       * values across 9 files (`text-[11px]` seventeen times), and a section
       * title rendered as `text-sm`, `text-base` *and* `text-lg` + semibold in
       * different places. Each step below carries its own line height and
       * tracking, so a heading cannot be the right size and the wrong rhythm.
       */
      fontSize: {
        /** Marketing hero only. */
        display: ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        /** Page title — one per page. */
        title: ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        /** Section title within a page. */
        heading: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        /** Card title. */
        subheading: ["1rem", { lineHeight: "1.4", letterSpacing: "-0.005em" }],
        /** Long-form body copy, slightly larger than `text-sm` for reading. */
        body: ["0.9375rem", { lineHeight: "1.6" }],
        /**
         * Labels, timestamps and eyebrows.
         *
         * 11px rather than Tailwind's 12px `text-xs` precisely because 11px is
         * what the codebase kept reaching for by hand. Tokenising the size
         * people actually wanted is what stops them writing it literally again.
         */
        caption: ["0.6875rem", { lineHeight: "1.45", letterSpacing: "0.01em" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
