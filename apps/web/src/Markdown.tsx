import type { ReactNode } from "react";

interface MarkdownProps {
  children: string;
}

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

interface ListLine {
  content: string;
  indent: number;
  ordered: boolean;
}

interface ListItem {
  content: string;
  children: ReactNode[];
}

interface ListRenderResult {
  nextIndex: number;
  node: ReactNode;
}

function getIndent(value: string): number {
  return value.replace(/\t/g, "  ").length;
}

function parseListLine(line: string): ListLine | null {
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  return {
    content: match[3],
    indent: getIndent(match[1]),
    ordered: /^\d/.test(match[2])
  };
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^[-*_]{3,}$/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^(\s*)[-*+]\s+/.test(line) ||
    /^(\s*)\d+[.)]\s+/.test(line)
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const key = `${keyPrefix}-inline-${tokenIndex}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {renderInline(linkMatch[1], key)}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = index + token.length;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderList(
  lines: string[],
  startIndex: number,
  baseIndent: number,
  ordered: boolean,
  keyPrefix: string
): ListRenderResult {
  const items: ListItem[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const item = parseListLine(lines[i]);
    if (!item) break;
    if (item.indent < baseIndent) break;

    if (item.indent > baseIndent) {
      if (items.length === 0) break;
      const nested = renderList(lines, i, item.indent, item.ordered, `${keyPrefix}-nested-${i}`);
      items[items.length - 1].children.push(nested.node);
      i = nested.nextIndex;
      continue;
    }

    if (item.ordered !== ordered) break;

    items.push({ content: item.content, children: [] });
    i += 1;
  }

  const ListTag = ordered ? "ol" : "ul";
  return {
    nextIndex: i,
    node: (
      <ListTag key={keyPrefix}>
        {items.map((item, index) => (
          <li key={`${keyPrefix}-item-${index}`}>
            {renderInline(item.content, `${keyPrefix}-item-${index}`)}
            {item.children}
          </li>
        ))}
      </ListTag>
    )
  };
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const key = `block-${i}`;

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={key}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const Heading = headingTags[headingMatch[1].length - 1];
      blocks.push(<Heading key={key}>{renderInline(headingMatch[2], key)}</Heading>);
      i += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={key} />);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(<blockquote key={key}>{renderInline(quoteLines.join(" "), key)}</blockquote>);
      continue;
    }

    const listLine = parseListLine(line);
    if (listLine) {
      const list = renderList(lines, i, listLine.indent, listLine.ordered, key);
      blocks.push(list.node);
      i = list.nextIndex;
      continue;
    }

    const paragraphLines = [trimmed];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={key}>{renderInline(paragraphLines.join(" "), key)}</p>);
  }

  return blocks;
}

export function Markdown({ children }: MarkdownProps) {
  return <div className="markdown-body">{renderMarkdown(children)}</div>;
}
