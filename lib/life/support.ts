// If a message sounds like the student is overwhelmed or unsafe, the site
// answers kindly and points to real help. Nothing about it is stored, logged
// or analysed: the check runs on the message in memory only.

const SIGNS = /\b(overwhelm(ed|ing)?|can'?t cope|cannot cope|not coping|breaking down|falling apart|panic attacks?|so stressed|too much for me|hopeless|worthless|unsafe|not safe|hurt(ing)? myself|self[- ]harm|kill myself|suicid\w*|end it all|want to die|don'?t want to (be here|live))\b/i;

export function soundsDistressed(text: string): boolean {
  return SIGNS.test(text);
}

export const SUPPORT_MESSAGE =
  "That sounds like a lot to carry, and it's okay to feel this way. Please talk to someone you trust, like a parent, a teacher or your school counsellor. You can also call Kids Helpline any time on 1800 55 1800 (free, 24/7), or chat at kidshelpline.com.au. If you're in danger right now, call 000.";
