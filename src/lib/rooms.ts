// The catalogue of bookable spaces, transcribed from docs/FACTSHEET.md (81
// spaces, four libraries). That file is the source; change both together. It
// will become the seed migration when the schema lands.

export const KINDS = [
  "study_room",
  "study_booth",
  "the_deck",
  "computer_desk",
  "accessibility_computer",
  "microfilm_scanner",
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  study_room: "Study room",
  study_booth: "Study booth",
  the_deck: "The Deck",
  computer_desk: "Computer desk",
  accessibility_computer: "Accessibility computer",
  microfilm_scanner: "Microfilm scanner",
};

export const LIBRARIES = [
  { id: "menzies", name: "Menzies" },
  { id: "hancock", name: "Hancock" },
  { id: "chifley", name: "Chifley" },
  { id: "law", name: "Law" },
] as const;
export type LibraryId = (typeof LIBRARIES)[number]["id"];

export type Space = {
  id: string;
  order: number;
  library: LibraryId;
  kind: Kind;
  name: string;
  capacity: number;
  /** Only spaces with 2+ seats can be shared. */
  shareable: boolean;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const spaces: Space[] = [];
function add(library: LibraryId, kind: Kind, name: string, capacity: number) {
  spaces.push({
    id: `${library}-${slug(name)}`,
    order: spaces.length,
    library,
    kind,
    name,
    capacity,
    shareable: capacity >= 2,
  });
}
const range = (from: number, to: number, pad = 0) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(pad, "0"));

// Menzies
for (const [n, c] of [["115A", 7], ["115C", 3], ["115E", 3]] as const) {
  add("menzies", "study_room", `Study room ${n}`, c);
}
add("menzies", "microfilm_scanner", "Microfilm Scanner", 1);

// Hancock
for (const n of ["3.27", "3.28", "3.29", "3.33", "3.34", "3.36"]) {
  add("hancock", "study_room", `Study room ${n}`, 4);
}
add("hancock", "study_room", "Study room 3.37", 3);
for (const n of ["3.38", "3.39"]) add("hancock", "study_room", `Study room ${n}`, 4);

// Chifley
for (const n of range(1, 6, 2)) add("chifley", "study_room", `Study room 1.${n}`, 4);
add("chifley", "study_room", "Study room 2.02G", 4);
for (const n of range(4, 7, 2)) add("chifley", "study_room", `Study room 3.${n}`, 4);
for (const n of range(2, 7, 2)) add("chifley", "study_room", `Study room 4.${n}`, 2);
add("chifley", "the_deck", "The Deck", 8);
add("chifley", "accessibility_computer", "Accessibility Computer", 1);
for (const n of range(10, 23)) {
  add("chifley", "study_booth", `Study Booth 3.${n}`, n === "11" || n === "12" ? 2 : 4);
}
for (const n of range(22, 52)) add("chifley", "computer_desk", `Computer Desk 2.${n}`, 1);

// Law
for (const n of range(1, 4)) add("law", "study_room", `Study room ${n}`, 4);

export const SPACES: readonly Space[] = spaces;

export const getSpace = (id: string) => SPACES.find((s) => s.id === id);
export const libraryName = (id: LibraryId) => LIBRARIES.find((l) => l.id === id)?.name ?? id;
