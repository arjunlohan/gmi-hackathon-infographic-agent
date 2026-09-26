// Composer choices shared by the composer and the brand kit editor.

export const DESTINATIONS = [
  { id: "auto", label: "Any destination", format: "" },
  { id: "article", label: "Article · 3:4", format: "portrait" },
  { id: "newsletter", label: "Newsletter · 1:1", format: "square" },
  { id: "blog-header", label: "Blog header · 16:9", format: "landscape" },
  { id: "story", label: "Social story · 9:16", format: "tall" },
] as const;

export const STYLES = [
  { id: "auto", label: "Style: auto" },
  { id: "dark_editorial", label: "Dark editorial" },
  { id: "cinematic_hero", label: "Cinematic hero" },
  { id: "chalkboard", label: "Chalkboard" },
  { id: "illustrated_map", label: "Illustrated map" },
  { id: "material_texture", label: "Material texture" },
  { id: "clean_light", label: "Clean light" },
  { id: "neon_tech", label: "Neon tech" },
] as const;
