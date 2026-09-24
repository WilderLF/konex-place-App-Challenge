export const SIZE = 100; // lienzo de 100 x 100 = 10.000 píxeles
export const COOLDOWN_MS = 15_000;

// Paleta de 16 colores. El índice 0 es el fondo del lienzo.
export const PALETTE = [
  "#FFFFFF", "#D4D7E3", "#8A8FA8", "#1B1E3C",
  "#FF9FC8", "#E5484D", "#FF8A1F", "#9A5B34",
  "#FFE14D", "#9BE35A", "#1FA34A", "#26D4E0",
  "#1E88E5", "#4353FF", "#B574F0", "#7A1FA2",
] as const;

export const COLOR_NAMES = [
  "Blanco", "Gris claro", "Gris", "Tinta",
  "Rosa", "Rojo", "Naranja", "Marrón",
  "Amarillo", "Lima", "Verde", "Celeste",
  "Azul", "Azul Webflow", "Lila", "Violeta",
];
