// Progress keys: every kind of key the app saves, what it stands for, and what that kind means for
// lesson % and for sounds. A key is "<kind>:<what>", for example "w:你" or "s:你好#ex".
// Keys are saved on every device: never rename a kind or change how its keys are built
// (tests/lesson-keys.test.js snapshots every lesson's keys; tests/keys.test.js checks every kind is listed).
//
// afterTries: done for lesson % after WRITE_TRIES tries, mistakes or not (completion.js)
// silent:     no right / wrong sound when saved: writing has its own stroke sounds, and flashcards
//             are self-rated, so "Again" must not sound like a mistake (sfx-pick.js)
export const KINDS = {
  w: { what: "writing a character (Write → Write it)", afterTries: true, silent: true },
  m: { what: "writing a character from memory (Write → From memory)", silent: true },
  d: { what: "writing a word in Dictation, From pinyin or From meaning", afterTries: true, silent: true },
  f: { what: "a flashcard", silent: true },
  q: { what: "a word in Word quiz or Match pairs" },
  l: { what: "Hear the word" },
  ls: { what: "an example sentence in Sentences (listening)" },
  t: { what: "a character's tone in Tones" },
  s: { what: "saying a word (s:<word>) or its example sentence (s:<word>#ex)" },
  r: { what: "a text's own quiz passed (r:<lesson>/<text>)" },
  rq: { what: "one question of a text in Read & answer (rq:<lesson>/<text>#<n>)" },
  o: { what: "a sentence in Build the sentence" },
  rp: { what: "How do you read it? (pinyin of a word)" },
  rad: { what: "Which radical? in a lesson (rad:<char>)" },
  g: { what: "a grammar drill (g:<lesson>/<point>.<drill>)" },
  wb: { what: "a workbook task: dialogue, true or false, reply (wb:<lesson>/<id>)" },
  wf: { what: "Fill in the word" },
  tc: { what: "Typing: type the characters" },
  tp: { what: "Typing: type the pinyin" },
  nb: { what: "a Notebook word (its own schedule; never a book key)" },
  bs: { what: "a radical in Radicals practice (bs:<radical>)" },
  bsl: { what: "a radical's lesson finished (bsl:<radical>)" },
};

export const kindOf = (key) => key.slice(0, key.indexOf(":"));
const flag = (name) => (key) => !!KINDS[kindOf(key)]?.[name];
export const afterTries = flag("afterTries");
export const silent = flag("silent");
