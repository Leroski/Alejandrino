export type Technique = {
  id: number;
  name: string;
  discipline: string;
  position: string;
  category: string;
  source: string;
  url: string;
};

// Reconoce también los valores usados por la versión anterior.
export function cleanField(value: string): string {
  const text = value.trim();
  return ["pendiente", "sin clasificar"].includes(text.toLowerCase())
    ? ""
    : text;
}

export function isPending(technique: Technique): boolean {
  return ![technique.discipline, technique.position, technique.category]
    .some((value) => cleanField(value) !== "");
}
