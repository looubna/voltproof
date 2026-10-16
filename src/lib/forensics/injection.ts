// Instructions aimed at AI systems, hidden in a document or a listing.
//
// A genuine invoice or battery report never addresses "AI systems". Text that
// does is an attempt to steer automated review, which is itself a strong sign
// the document was tampered with. Any value read from such a line is excluded,
// whatever the model did with it.

const PATTERNS: RegExp[] = [
  /\b(ai|a\.i\.|llm|language model|automated|assistant|chatbot|gpt|gemini|model)s?\b[^.\n]{0,60}\b(must|should|shall|need to|please|always)\b[^.\n]{0,80}\b(report|say|state|output|answer|return|mark|treat|ignore|classify)\b/i,
  /\bignore\b[^.\n]{0,30}\b(previous|prior|above|earlier|all)\b[^.\n]{0,30}\b(instruction|instructions|prompt|rules)\b/i,
  /\b(disregard|override)\b[^.\n]{0,40}\b(instruction|instructions|rules|checks|system prompt)\b/i,
  /\b(report|state|record|output)\b[^.\n]{0,40}\bas\s+\d{1,3}\s*%/i,
  /\b(ai|assistant|model)\s*[:\-]\s*(report|say|mark|set|output)\b/i,
  /\bsystem prompt\b/i,
];

/** Lines (or sentences) that read as instructions to an AI. */
export function findInjections(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/\n|(?<=[.!?])\s+/)) {
    const line = chunk.trim();
    if (line.length >= 8 && PATTERNS.some((p) => p.test(line))) out.push(line.slice(0, 240));
  }
  return Array.from(new Set(out));
}

export function isInjection(text: string): boolean {
  return findInjections(text).length > 0;
}

/** True when a quoted snippet sits inside one of the injection lines. */
export function quoteFromInjection(quote: string | null | undefined, injections: string[]): boolean {
  if (!quote) return false;
  const q = quote.toLowerCase().replace(/\s+/g, " ").trim();
  return injections.some((line) => {
    const l = line.toLowerCase().replace(/\s+/g, " ");
    // Short quotes such as "99%" count too: the document already addresses AI systems.
    return (q.length >= 2 && l.includes(q)) || (q.length >= 4 && q.includes(l));
  });
}
