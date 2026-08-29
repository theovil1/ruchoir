import emojiRegex from "emoji-regex";
import type { ReactNode } from "react";
import { Emoji } from "../app/Emoji";
import { replaceShortcodes } from "@/lib/shortcodes";
import { CodeBlock } from "./CodeBlock";

/** Anchored emoji matcher (to test at a given position). */
const EMOJI_RE = new RegExp(`^(?:${emojiRegex().source})`);

/**
 * Rich-text renderer for message bodies. Handles the subset the composer produces: **bold**,
 * _italic_, `code`, fenced ``` code blocks (highlighted by CodeBlock), http(s) links, "- " lists,
 * and @mentions. Inline formatting builds React nodes; code highlighting happens in CodeBlock.
 */

function matchMention(text: string, from: number, names: string[]): string | null {
  const rest = text.slice(from);
  let best: string | null = null;
  for (const n of names) {
    if (rest.startsWith(n) && (!best || n.length > best.length)) best = n;
  }
  return best;
}

function renderInline(text: string, names: string[], keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let k = 0;
  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };
  while (i < text.length) {
    const em = EMOJI_RE.exec(text.slice(i));
    if (em) {
      flush();
      nodes.push(<Emoji key={`${keyBase}-e${k++}`} emoji={em[0]} size={19} />);
      i += em[0].length;
      continue;
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        nodes.push(<strong key={`${keyBase}-b${k++}`}>{renderInline(text.slice(i + 2, end), names, `${keyBase}-b${k}`)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        nodes.push(<code key={`${keyBase}-c${k++}`} className="wc-code">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "_") {
      const end = text.indexOf("_", i + 1);
      if (end > i) {
        flush();
        nodes.push(<em key={`${keyBase}-i${k++}`}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "@") {
      const name = matchMention(text, i + 1, names);
      if (name) {
        flush();
        nodes.push(
          <span key={`${keyBase}-m${k++}`} className="wc-mention">
            @{name}
          </span>,
        );
        i = i + 1 + name.length;
        continue;
      }
    }
    if (text.startsWith("http", i)) {
      const m = /^https?:\/\/[^\s]+/.exec(text.slice(i));
      if (m) {
        flush();
        const url = m[0];
        nodes.push(
          <a key={`${keyBase}-l${k++}`} href={url} onClick={(e) => e.preventDefault()}>
            {url}
          </a>,
        );
        i += url.length;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return nodes;
}

/** Render a plain-text block (no fenced code): lists, line breaks, and inline formatting. */
function renderTextBlock(text: string, names: string[], keyBase: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] | null = null;
  let bi = 0;

  const closeList = () => {
    if (list) {
      blocks.push(
        <ul key={`${keyBase}-ul${bi++}`} style={{ margin: "2px 0", paddingLeft: 20 }}>
          {list}
        </ul>,
      );
      list = null;
    }
  };

  lines.forEach((line, idx) => {
    if (line.startsWith("- ")) {
      list ??= [];
      list.push(<li key={`${keyBase}-li${idx}`}>{renderInline(line.slice(2), names, `${keyBase}li${idx}`)}</li>);
    } else {
      closeList();
      blocks.push(
        <span key={`${keyBase}-ln${idx}`}>
          {renderInline(line, names, `${keyBase}ln${idx}`)}
          {idx < lines.length - 1 ? "\n" : null}
        </span>,
      );
    }
  });
  closeList();
  return blocks;
}

export function renderRichText(text: string, names: string[], editable = false): ReactNode {
  // Split on ``` fences: odd segments are fenced code blocks.
  const segments = text.split("```");
  const out: ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (i % 2 === 1) {
      let code = seg;
      let lang: string | undefined;
      const nl = code.indexOf("\n");
      if (nl > -1) {
        const first = code.slice(0, nl).trim();
        if (/^[a-z0-9+#.-]{1,12}$/i.test(first)) {
          lang = first.toLowerCase();
          code = code.slice(nl + 1);
        }
      }
      code = code.replace(/\n$/, "");
      out.push(<CodeBlock key={`pre${i}`} code={code} declaredLang={lang} editable={editable} />);
    } else if (seg) {
      out.push(...renderTextBlock(replaceShortcodes(seg), names, `s${i}`));
    }
  });
  return out;
}
