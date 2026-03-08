import { Code } from "@mantine/core";
import type { ReactNode } from "react";

const inlineCodePattern = /`([^`]+)`/g;

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

    nodes.push(<Code key={`${matchIndex}-${codeValue}`}>{codeValue}</Code>);
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
};

export { renderInlineCode };
