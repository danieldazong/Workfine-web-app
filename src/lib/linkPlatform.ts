// Deterministic platform detection from a URL hostname. NO external favicon
// fetching — brand color + label + icon key are derived locally, with the
// monogram as the universal fallback. No secrets, works offline.
import { monogramGradient, monogramInitials } from "./monogram";

export interface PlatformInfo {
  label: string;      // e.g. "YouTube"
  color: string;      // brand color; "" means use monogram gradient
  initial: string;    // fallback letter when no icon
  iconKey: string;    // key into the LinkAvatar SVG map; "" means no logo
}

// Known platforms → label, brand color, and iconKey (for inline SVG logos).
const KNOWN: { match: string[]; label: string; color: string; iconKey: string }[] = [
  { match: ["youtube.com", "youtu.be"],             label: "YouTube",   color: "#FF0000", iconKey: "youtube"   },
  { match: ["facebook.com", "fb.com"],              label: "Facebook",  color: "#1877F2", iconKey: "facebook"  },
  { match: ["zoom.us", "zoom.com"],                 label: "Zoom",      color: "#2D8CFF", iconKey: "zoom"      },
  { match: ["instagram.com"],                       label: "Instagram", color: "#E4405F", iconKey: "instagram" },
  { match: ["twitter.com", "x.com"],                label: "X",         color: "#000000", iconKey: "x"         },
  { match: ["linkedin.com"],                        label: "LinkedIn",  color: "#0A66C2", iconKey: "linkedin"  },
  { match: ["github.com"],                          label: "GitHub",    color: "#181717", iconKey: "github"    },
  { match: ["slack.com"],                           label: "Slack",     color: "#4A154B", iconKey: "slack"     },
  { match: ["figma.com"],                           label: "Figma",     color: "#F24E1E", iconKey: "figma"     },
  { match: ["meet.google.com"],                     label: "Meet",      color: "#00897B", iconKey: "meet"      },
  { match: ["drive.google.com", "docs.google.com"], label: "Google",    color: "#4285F4", iconKey: "google"    },
  { match: ["whatsapp.com", "wa.me"],               label: "WhatsApp",  color: "#25D366", iconKey: "whatsapp"  },
  { match: ["discord.com", "discord.gg"],           label: "Discord",   color: "#5865F2", iconKey: "discord"   },
];

// Safely add a protocol if the user typed "youtube.com" without one.
export function normalizeUrl(raw: string): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function hostnameOf(raw: string): string {
  try {
    return new URL(normalizeUrl(raw)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Returns platform styling for a URL. Unknown hosts get a monogram gradient
// (color: "") and a letter initial (iconKey: "").
export function resolvePlatform(url: string, title?: string): PlatformInfo {
  const host = hostnameOf(url);

  for (const p of KNOWN) {
    if (p.match.some((m) => host === m || host.endsWith(`.${m}`))) {
      return {
        label: p.label,
        color: p.color,
        iconKey: p.iconKey,
        initial: p.label.charAt(0).toUpperCase(),
      };
    }
  }

  return {
    label: host || "Link",
    color: "",
    iconKey: "",
    initial: monogramInitials(title || host, null),
  };
}

// Seed for the monogram-gradient fallback (unknown hosts).
export function platformGradientSeed(url: string, title?: string): string {
  const host = hostnameOf(url);
  return title?.trim() || host || "?";
}

export { monogramGradient };
