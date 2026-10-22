// Shared app state: which lesson / word / tab is open.
import { LESSONS } from "./data/index.js";
import { place } from "./progress/store.js";

export const app = {
  lesson: 0,
  word: 0,
  tab: "write",
  L: () => LESSONS[app.lesson],
  savePlace() {
    place.set({ lid: app.L().id, word: app.word, tab: app.tab });
  },
};

export const TAB_NAME = {
  write: "Write", dict: "Dictation", cards: "Flashcards", tones: "Tones", review: "Review",
};
