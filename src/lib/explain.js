// Why an answer is right, and why the chosen option is wrong. Text from src/data/explain/ (built into explain.gen.json),
// loaded the first time a quiz shows an answer.
import { esc } from "./util.js";

let data = null;
const load = () => (data ||= import("../data/explain.gen.json").then((m) => m.default, () => ({})));

// Chinese stays in the Chinese font inside the English sentence.
const mixed = (s) => esc(s).replace(/[\p{Script=Han}，。！？、：；（）“”…·]+/gu, (m) => `<span class="hz">${m}</span>`);

// Adds the explanation under the answer in `el`. `chosen` is the text of a wrong option the learner picked, if any.
export async function showWhy(el, key, chosen) {
  const e = key && (await load())[key];
  if (!e || !el.isConnected) return;
  const not = chosen && e.not?.[chosen];
  el.insertAdjacentHTML("beforeend", `<div class="why">
    ${not ? `<p><span class="why-lbl">Not ${mixed(chosen)}</span> ${mixed(not)}</p>` : ""}
    <p><span class="why-lbl">Why</span> ${mixed(e.why)}</p></div>`);
}
