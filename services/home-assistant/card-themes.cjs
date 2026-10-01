// Generates config/themes/card-colors.yaml: one color theme per dashboard card,
// most with a large, faint icon watermark in the bottom-right corner.
// Run `node services/home-assistant/card-themes.cjs` from the repo root, copy
// the YAML to the NAS and reload themes (Developer tools -> YAML -> Themes).
//
// Icon outlines are from Material Design Icons (pictogrammers.com, Apache 2.0),
// the set Home Assistant itself uses; copy more from the @mdi/svg package.

const fs = require("fs");
const path = require("path");

const ICONS = {
  "fire": "M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z",
  "fan": "M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",
  "power-socket-eu": "M7.5,10.5A1.5,1.5 0 0,1 9,12A1.5,1.5 0 0,1 7.5,13.5C6.66,13.5 6,12.83 6,12A1.5,1.5 0 0,1 7.5,10.5M16.5,10.5A1.5,1.5 0 0,1 18,12A1.5,1.5 0 0,1 16.5,13.5A1.5,1.5 0 0,1 15,12A1.5,1.5 0 0,1 16.5,10.5M4.22,2H19.78C21,2 22,3 22,4.22V19.78A2.22,2.22 0 0,1 19.78,22H4.22C3,22 2,21 2,19.78V4.22A2.22,2.22 0 0,1 4.22,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z",
  "desktop-tower-monitor": "M22,18H17A1,1 0 0,1 16,17V7A1,1 0 0,1 17,6H22A1,1 0 0,1 23,7V17A1,1 0 0,1 22,18M22,8H17V9H22V8M22,10H17V11H22V10M9,15V17H10V18H5V17H6V15H2A1,1 0 0,1 1,14V7A1,1 0 0,1 2,6H13A1,1 0 0,1 14,7V14A1,1 0 0,1 13,15H9M12,8H3V13H12V8Z",
  "web": "M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  "nas": "M4,5C2.89,5 2,5.89 2,7V17C2,18.11 2.89,19 4,19H20C21.11,19 22,18.11 22,17V7C22,5.89 21.11,5 20,5H4M4.5,7A1,1 0 0,1 5.5,8A1,1 0 0,1 4.5,9A1,1 0 0,1 3.5,8A1,1 0 0,1 4.5,7M7,7H20V17H7V7M8,8V16H11V8H8M12,8V16H15V8H12M16,8V16H19V8H16M9,9H10V10H9V9M13,9H14V10H13V9M17,9H18V10H17V9Z",
  "weather-partly-cloudy": "M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.94,9.06 13.18,7.86 11.93,7.3M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.29 14.19,3.93 13.55,3.64M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.73C18.03,11.08 18.05,10.4 18,9.71M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.28C3,9.93 2.97,10.61 3.04,11.3M19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18Z",
  "alert-outline": "M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16",
  "weather-sunset": "M3,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H21A1,1 0 0,1 22,13A1,1 0 0,1 21,14H3A1,1 0 0,1 2,13A1,1 0 0,1 3,12M5,16H19A1,1 0 0,1 20,17A1,1 0 0,1 19,18H5A1,1 0 0,1 4,17A1,1 0 0,1 5,16M17,20A1,1 0 0,1 18,21A1,1 0 0,1 17,22H7A1,1 0 0,1 6,21A1,1 0 0,1 7,20H17M15,12A3,3 0 0,0 12,9A3,3 0 0,0 9,12H15M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7Z",
  "shield-check-outline": "M21,11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1L21,5V11M12,21C15.75,20 19,15.54 19,11.22V6.3L12,3.18L5,6.3V11.22C5,15.54 8.25,20 12,21M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9",
  "alert": "M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z",
  "alert-octagon": "M13 13H11V7H13M11 15H13V17H11M15.73 3H8.27L3 8.27V15.73L8.27 21H15.73L21 15.73V8.27L15.73 3Z",
  "help-circle-outline": "M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z",
};

// Two cards stacked with no gap read as one card when the top one has square
// bottom corners and no bottom border, and the bottom one the opposite.
const R = "var(--ha-border-radius-lg)";
const TOP = { "ha-card-border-radius": `${R} ${R} 0 0`, "ha-card-border-width": "1px 1px 0 1px" };
const BOTTOM = { "ha-card-border-radius": `0 0 ${R} ${R}`, "ha-card-border-width": "0 1px 1px 1px" };

// name, accent rgb, header/icon rgb (a little darker where the accent is too
// light to read as text), watermark icon (null = none), extra variables.
const THEMES = [
  ["card-heat-top", "255 136 48", "255 136 48", null, TOP],
  ["card-heat-bottom", "255 136 48", "255 136 48", "fire", BOTTOM],
  ["card-cool", "56 172 240", "56 172 240", "fan"],
  ["card-amber", "240 182 30", "222 164 16", "power-socket-eu"],
  ["card-purple", "160 100 240", "160 100 240", "desktop-tower-monitor"],
  ["card-green", "52 186 110", "40 170 96", "web"],
  ["card-indigo", "98 118 240", "98 118 240", "nas"],
  ["card-sky", "70 150 230", "56 134 214", "weather-partly-cloudy"],
  // IPMA warning levels: the warnings card shows the one matching the level.
  ["card-warn-green", "52 186 110", "40 170 96", "shield-check-outline"],
  ["card-warn-yellow", "240 200 30", "196 160 0", "alert-outline"],
  ["card-warn-orange", "255 136 48", "236 112 20", "alert"],
  ["card-warn-red", "232 64 52", "214 48 40", "alert-octagon"],
  ["card-warn-unknown", "140 140 150", "120 120 130", "help-circle-outline"],
  ["card-sun", "245 166 35", "226 146 20", "weather-sunset"],
];

function watermark(icon, rgb) {
  const fill = `rgb(${rgb.replace(/ /g, ",")})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" fill-opacity="0.16" d="${ICONS[icon]}"/></svg>`;
  const uri = encodeURIComponent(svg).replace(/'/g, "%27");
  return `url("data:image/svg+xml,${uri}") right -14px bottom -18px / 120px 120px no-repeat`;
}

const lines = [
  "# Generated by services/home-assistant/card-themes.cjs; edit that, not this.",
  "# Per-card color themes: each dashboard card names one with its `theme:`",
  "# option. Backgrounds and borders are mixed from the normal card color, so",
  "# they work in light and dark mode.",
  "",
  "# The app-wide default theme (set with frontend.set_theme for light and dark).",
  "# It only removes the gap inside vertical stacks, so stacked cards can be",
  "# styled as one; everything else is Home Assistant's default look.",
  "homelab:",
  "  modes:",
  "    light:",
  "      vertical-stack-card-gap: '0px'",
  "    dark:",
  "      vertical-stack-card-gap: '0px'",
];
for (const [name, rgb, header, icon, extra = {}] of THEMES) {
  const tint = `color-mix(in srgb, rgb(${rgb}) 13%, var(--card-background-color))`;
  const background = icon ? `${watermark(icon, rgb)}, ${tint}` : tint;
  lines.push(
    "",
    `${name}:`,
    `  ha-card-background: '${background}'`,
    `  ha-card-border-color: 'color-mix(in srgb, rgb(${rgb}) 45%, var(--card-background-color))'`,
    `  ha-card-header-color: 'rgb(${header})'`,
    `  state-icon-color: 'rgb(${header})'`,
    `  ha-switch-checked-background-color: 'rgb(${header})'`,
    ...Object.entries(extra).map(([k, v]) => `  ${k}: '${v}'`),
  );
}
fs.writeFileSync(path.join(__dirname, "config", "themes", "card-colors.yaml"), lines.join("\n") + "\n");
console.log("wrote config/themes/card-colors.yaml");
