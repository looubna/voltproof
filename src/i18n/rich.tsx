import { Fragment, type ReactNode } from "react";

/**
 * Fills "{name}" placeholders with elements, such as a link inside a translated sentence,
 * so each language can put the link where its grammar needs it. Works in server and client components.
 */
export function rich(message: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    const at = match.index ?? 0;
    out.push(message.slice(last, at));
    out.push(match[1] in parts ? <Fragment key={at}>{parts[match[1]]}</Fragment> : match[0]);
    last = at + match[0].length;
  }
  out.push(message.slice(last));
  return out;
}
