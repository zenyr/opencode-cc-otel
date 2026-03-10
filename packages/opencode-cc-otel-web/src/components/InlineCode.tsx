import { Code } from "@mantine/core";
import type { ReactNode } from "react";

const inlineCodePattern = /`([^`]+)`/g;
const INLINE_CODE_CLASS_NAME = "inline-code";

const renderInlineCode = (value: string) => {
  const matches = Array.from(value.matchAll(inlineCodePattern));

  if (matches.length === 0) {
    return value;
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const codeValue = match[1];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(value.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <Code
        className={INLINE_CODE_CLASS_NAME}
        key={`${matchIndex}-${codeValue}`}
      >
        {codeValue}
      </Code>,
    );
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
};

export { INLINE_CODE_CLASS_NAME, renderInlineCode };
