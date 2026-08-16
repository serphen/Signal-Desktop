// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, JSX } from 'react';
import classNames from 'classnames';
import lodash from 'lodash';

import { linkify, SUPPORTED_PROTOCOLS } from './Linkify.dom.tsx';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import scala from 'highlight.js/lib/languages/scala';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import makefile from 'highlight.js/lib/languages/makefile';
import lua from 'highlight.js/lib/languages/lua';
import perl from 'highlight.js/lib/languages/perl';
import r from 'highlight.js/lib/languages/r';
import haskell from 'highlight.js/lib/languages/haskell';
import clojure from 'highlight.js/lib/languages/clojure';
import lisp from 'highlight.js/lib/languages/lisp';
import scheme from 'highlight.js/lib/languages/scheme';
import ocaml from 'highlight.js/lib/languages/ocaml';
import fsharp from 'highlight.js/lib/languages/fsharp';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import ini from 'highlight.js/lib/languages/ini';
import nginx from 'highlight.js/lib/languages/nginx';
import markdown from 'highlight.js/lib/languages/markdown';
import latex from 'highlight.js/lib/languages/latex';
import graphql from 'highlight.js/lib/languages/graphql';
import protobuf from 'highlight.js/lib/languages/protobuf';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('c#', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('sass', scss);
hljs.registerLanguage('less', scss);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('r', r);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('hs', haskell);
hljs.registerLanguage('clojure', clojure);
hljs.registerLanguage('clj', clojure);
hljs.registerLanguage('lisp', lisp);
hljs.registerLanguage('scheme', scheme);
hljs.registerLanguage('ocaml', ocaml);
hljs.registerLanguage('ml', ocaml);
hljs.registerLanguage('fsharp', fsharp);
hljs.registerLanguage('f#', fsharp);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('patch', diff);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('conf', ini);
hljs.registerLanguage('toml', ini);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('latex', latex);
hljs.registerLanguage('tex', latex);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('gql', graphql);
hljs.registerLanguage('protobuf', protobuf);
hljs.registerLanguage('proto', protobuf);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('ex', elixir);
hljs.registerLanguage('erlang', erlang);

import type {
  BodyRangesForDisplayType,
  DisplayBodyRangeType,
  DisplayNode,
  HydratedBodyRangeMention,
} from '../../types/BodyRange.std.ts';
import {
  BodyRange,
  collapseRangesToDisplayNodes,
  groupContiguousSpoilers,
} from '../../types/BodyRange.std.ts';
import { AtMention } from './AtMention.dom.tsx';
import { isLinkSneaky } from '../../types/LinkPreview.std.ts';
import { Emojify } from './Emojify.dom.tsx';
import { AddNewLines } from './AddNewLines.dom.tsx';
import type { LocalizerType } from '../../types/Util.std.ts';
import type { FunJumboEmojiSize } from '../fun/FunEmoji.dom.tsx';
import { Emoji } from '../../axo/emoji.std.ts';

const { sortBy } = lodash;

const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

function highlightCode(code: string, lang: string | null): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value;
  }
  // No language specified — return as plain escaped text, no auto-detection
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function CodeBlock({
  code,
  lang,
  isInvisible,
}: {
  code: string;
  lang: string | null;
  isInvisible: boolean;
}): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <pre
      className={classNames(
        'codeblock',
        lang ? `codeblock--${lang}` : null,
        isInvisible ? 'MessageTextRenderer__formatting--invisible' : null
      )}
    >
      {lang && <div className="codeblock__lang">{lang}</div>}
      <button
        type="button"
        className={classNames('codeblock__copy', copied && 'codeblock__copy--copied')}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      {/* eslint-disable-next-line react/no-danger -- highlight.js HTML-escapes all input */}
      <code dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />
    </pre>
  );
}

const KNOWN_LANGUAGES = [
  'javascript', 'js', 'typescript', 'ts', 'python', 'py', 'java', 'c',
  'cpp', 'c++', 'csharp', 'c#', 'cs', 'go', 'rust', 'rs', 'ruby', 'rb',
  'php', 'swift', 'kotlin', 'scala', 'html', 'css', 'scss', 'sass',
  'less', 'json', 'xml', 'yaml', 'yml', 'toml', 'sql', 'bash', 'sh',
  'shell', 'zsh', 'powershell', 'ps1', 'dockerfile', 'docker', 'makefile',
  'lua', 'perl', 'r', 'matlab', 'julia', 'elixir', 'ex', 'erlang',
  'haskell', 'hs', 'clojure', 'clj', 'lisp', 'scheme', 'ocaml', 'ml',
  'fsharp', 'f#', 'dart', 'zig', 'nim', 'v', 'assembly', 'asm', 'nasm',
  'wasm', 'graphql', 'gql', 'proto', 'protobuf', 'terraform', 'tf',
  'diff', 'patch', 'ini', 'conf', 'nginx', 'apache', 'markdown', 'md',
  'latex', 'tex', 'csv', 'tsv', 'plaintext', 'text', 'txt', 'log',
  'jsx', 'tsx', 'vue', 'svelte', 'astro', 'objc', 'objective-c',
];
export enum RenderLocation {
  ConversationList = 'ConversationList',
  Quote = 'Quote',
  MediaEditor = 'MediaEditor',
  PinnedMessagesBar = 'PinnedMessagesBar',
  SearchResult = 'SearchResult',
  StoryViewer = 'StoryViewer',
  Timeline = 'Timeline',
}

type Props = {
  bodyRanges: BodyRangesForDisplayType;
  direction: 'incoming' | 'outgoing' | undefined;
  disableLinks: boolean;
  jumboEmojiSize: FunJumboEmojiSize | null;
  i18n: LocalizerType;
  isSpoilerExpanded: Record<number, boolean>;
  messageText: string;
  originalMessageText: string;
  onExpandSpoiler?: (data: Record<number, boolean>) => void;
  onMentionTrigger: (conversationId: string) => void;
  renderLocation: RenderLocation;
  // Sometimes we're passed a string with a suffix (like '...'); we won't process that
  textLength: number;
};

export function MessageTextRenderer({
  bodyRanges,
  direction,
  disableLinks,
  jumboEmojiSize,
  i18n,
  isSpoilerExpanded,
  messageText,
  onExpandSpoiler,
  onMentionTrigger,
  renderLocation,
  textLength,
  originalMessageText,
}: Props): JSX.Element {
  const finalNodes = useMemo(() => {
    const links = disableLinks
      ? []
      : extractLinks(originalMessageText, textLength);

    // We need mentions to come last; they can't have children for proper rendering
    const sortedRanges = sortBy(bodyRanges, range =>
      BodyRange.isMention(range) ? 1 : 0
    );

    // Prepare ranges (assign spoiler ids, drop ones that don't apply
    let spoilerCount = 0;
    const preparedRanges: Array<DisplayBodyRangeType> = [];
    for (const range of sortedRanges) {
      if (
        BodyRange.isFormatting(range) &&
        range.style === BodyRange.Style.SPOILER
      ) {
        spoilerCount += 1;
        preparedRanges.push({ ...range, spoilerId: spoilerCount });
      } else if (range.start < textLength) {
        preparedRanges.push(range);
      }
    }

    const nodes = collapseRangesToDisplayNodes(messageText, [
      ...links,
      ...preparedRanges,
    ]);

    // Group all contigusous spoilers to create one parent spoiler element in the DOM
    return groupContiguousSpoilers(nodes);
  }, [bodyRanges, disableLinks, messageText, originalMessageText, textLength]);

  return (
    <>
      {finalNodes.map(node =>
        renderNode({
          direction,
          disableLinks,
          jumboEmojiSize,
          i18n,
          isInvisible: false,
          isSpoilerExpanded,
          node,
          renderLocation,
          onMentionTrigger,
          onExpandSpoiler,
        })
      )}
    </>
  );
}

function renderNode({
  direction,
  disableLinks,
  jumboEmojiSize,
  i18n,
  isInvisible,
  isSpoilerExpanded,
  node,
  onExpandSpoiler,
  onMentionTrigger,
  renderLocation,
}: {
  direction: 'incoming' | 'outgoing' | undefined;
  disableLinks: boolean;
  jumboEmojiSize: FunJumboEmojiSize | null;
  i18n: LocalizerType;
  isInvisible: boolean;
  isSpoilerExpanded: Record<number, boolean>;
  node: DisplayNode;
  onExpandSpoiler?: (data: Record<number, boolean>) => void;
  onMentionTrigger: ((conversationId: string) => void) | undefined;
  renderLocation: RenderLocation;
}): ReactElement {
  const key = node.start;

  if (node.isSpoiler && node.spoilerChildren?.length) {
    const isSpoilerHidden =
      node.isSpoiler && !isSpoilerExpanded[node.spoilerId || 0];
    const content = node.spoilerChildren?.map(spoilerNode =>
      renderNode({
        direction,
        disableLinks,
        jumboEmojiSize,
        i18n,
        isInvisible: isSpoilerHidden,
        isSpoilerExpanded,
        node: spoilerNode,
        renderLocation,
        onMentionTrigger,
        onExpandSpoiler,
      })
    );

    if (!isSpoilerHidden) {
      return (
        <span
          key={key}
          className="MessageTextRenderer__formatting--spoiler--revealed"
        >
          {content}
        </span>
      );
    }

    return (
      // oxlint-disable-next-line jsx_a11y/no-static-element-interactions
      <span
        key={key}
        tabIndex={disableLinks ? undefined : 0}
        role={disableLinks ? undefined : 'button'}
        aria-label={i18n('icu:MessageTextRenderer--spoiler--label')}
        aria-expanded={false}
        className={classNames(
          'MessageTextRenderer__formatting--spoiler',
          `MessageTextRenderer__formatting--spoiler-${renderLocation}`,
          direction
            ? `MessageTextRenderer__formatting--spoiler-${renderLocation}--${direction}`
            : null,
          disableLinks
            ? 'MessageTextRenderer__formatting--spoiler--noninteractive'
            : null
        )}
        onClick={
          disableLinks
            ? undefined
            : event => {
                if (onExpandSpoiler) {
                  event.preventDefault();
                  event.stopPropagation();
                  onExpandSpoiler({
                    ...isSpoilerExpanded,
                    [node.spoilerId || 0]: true,
                  });
                }
              }
        }
        onKeyDown={
          disableLinks
            ? undefined
            : event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onExpandSpoiler?.({
                  ...isSpoilerExpanded,
                  [node.spoilerId || 0]: true,
                });
              }
        }
      >
        <span aria-hidden>{content}</span>
      </span>
    );
  }

  let content = renderMentions({
    direction,
    disableLinks,
    jumboEmojiSize,
    isInvisible,
    mentions: node.mentions,
    onMentionTrigger,
    node,
  });

  // We use separate elements for these because we want screenreaders to understand them
  if (node.isBold || node.isKeywordHighlight) {
    content = <strong>{content}</strong>;
  }
  if (node.isItalic) {
    content = <em>{content}</em>;
  }
  if (node.isStrikethrough) {
    content = <s>{content}</s>;
  }

  // Code block detection: monospace body range with newlines → render as <pre><code>
  if (node.isMonospace && node.text.includes('\n') && renderLocation === RenderLocation.Timeline) {
    const text = node.text;
    const firstNewline = text.indexOf('\n');
    let lang: string | null = null;
    let codeText = text;

    if (firstNewline > 0) {
      const possibleLang = text.substring(0, firstNewline).trim().toLowerCase();
      if (KNOWN_LANGUAGES.includes(possibleLang)) {
        lang = possibleLang;
        codeText = text.substring(firstNewline + 1);
      }
    }

    return <CodeBlock key={key} code={codeText} lang={lang} isInvisible={isInvisible} />;
  }

  // Code block detection: ```lang\n...\n``` in plain text (no MONOSPACE body range)
  if (!node.isMonospace && renderLocation === RenderLocation.Timeline &&
      node.mentions.length === 0 && CODE_BLOCK_REGEX.test(node.text)) {
    CODE_BLOCK_REGEX.lastIndex = 0;
    const parts: ReactElement[] = [];
    let lastIndex = 0;
    let match;

    while ((match = CODE_BLOCK_REGEX.exec(node.text)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        parts.push(
          renderText({
            text: node.text.slice(lastIndex, match.index),
            key: `${key}-t${parts.length}`,
            jumboEmojiSize,
            isInvisible,
          })
        );
      }

      const rawLang = match[1].trim().toLowerCase();
      const lang = rawLang && KNOWN_LANGUAGES.includes(rawLang) ? rawLang : null;
      const codeText = match[2];

      parts.push(
        <CodeBlock key={`${key}-c${parts.length}`} code={codeText} lang={lang} isInvisible={isInvisible} />
      );

      lastIndex = match.index + match[0].length;
    }

    // Text after last code block
    if (lastIndex < node.text.length) {
      parts.push(
        renderText({
          text: node.text.slice(lastIndex),
          key: `${key}-t${parts.length}`,
          jumboEmojiSize,
          isInvisible,
        })
      );
    }

    return <span key={key}>{parts}</span>;
  }

  const formattingClasses = classNames(
    node.isMonospace ? 'MessageTextRenderer__formatting--monospace' : null,
    node.isKeywordHighlight
      ? 'MessageTextRenderer__formatting--keywordHighlight'
      : null,
    isInvisible ? 'MessageTextRenderer__formatting--invisible' : null
  );

  if (
    node.url &&
    SUPPORTED_PROTOCOLS.test(node.url) &&
    isLinkSneaky(node.url) !== 'yes'
  ) {
    return (
      <a
        key={key}
        className={formattingClasses}
        href={node.url}
        target="_blank"
        rel="noreferrer"
      >
        {content}
      </a>
    );
  }

  return (
    <span key={key} className={formattingClasses}>
      {content}
    </span>
  );
}

function renderMentions({
  direction,
  disableLinks,
  jumboEmojiSize,
  isInvisible,
  mentions,
  node,
  onMentionTrigger,
}: {
  direction: 'incoming' | 'outgoing' | undefined;
  disableLinks: boolean;
  jumboEmojiSize: FunJumboEmojiSize | null;
  isInvisible: boolean;
  mentions: ReadonlyArray<HydratedBodyRangeMention>;
  node: DisplayNode;
  onMentionTrigger: ((conversationId: string) => void) | undefined;
}): ReactElement {
  const result: Array<ReactElement> = [];
  const { text } = node;

  let offset = 0;

  for (const mention of mentions) {
    // collect any previous text
    if (mention.start > offset) {
      result.push(
        renderText({
          isInvisible,
          key: result.length.toString(),
          jumboEmojiSize,
          text: text.slice(offset, mention.start),
        })
      );
    }

    result.push(
      renderMention({
        isInvisible,
        key: result.length.toString(),
        conversationId: mention.conversationID,
        disableLinks,
        direction,
        name: mention.replacementText,
        node,
        onMentionTrigger,
      })
    );

    offset = mention.start + mention.length;
  }

  // collect any text after
  result.push(
    renderText({
      isInvisible,
      key: result.length.toString(),
      jumboEmojiSize,
      text: text.slice(offset, text.length),
    })
  );

  return <>{result}</>;
}

function renderMention({
  conversationId,
  direction,
  disableLinks,
  isInvisible,
  key,
  name,
  node,
  onMentionTrigger,
}: {
  conversationId: string;
  direction: 'incoming' | 'outgoing' | undefined;
  disableLinks: boolean;
  isInvisible: boolean;
  key: string;
  name: string;
  node: DisplayNode;
  onMentionTrigger: ((conversationId: string) => void) | undefined;
}): ReactElement {
  if (disableLinks) {
    return (
      <bdi key={key}>
        @
        <Emojify isInvisible={isInvisible} text={name} />
      </bdi>
    );
  }

  return (
    <AtMention
      key={key}
      id={conversationId}
      isInvisible={isInvisible}
      isStrikethrough={node.isStrikethrough}
      name={name}
      direction={direction}
      onClick={() => {
        if (onMentionTrigger) {
          onMentionTrigger(conversationId);
        }
      }}
      onKeyUp={e => {
        if (
          e.target === e.currentTarget &&
          e.key === 'Enter' &&
          onMentionTrigger
        ) {
          onMentionTrigger(conversationId);
        }
      }}
    />
  );
}
/** Render text that does not contain body ranges or is in between body ranges */
function renderText({
  text,
  jumboEmojiSize,
  isInvisible,
  key,
}: {
  text: string;
  jumboEmojiSize: FunJumboEmojiSize | null;
  isInvisible: boolean;
  key: string;
}) {
  return (
    <Emojify
      key={key}
      isInvisible={isInvisible}
      renderNonEmoji={({ text: innerText, key: innerKey }) => (
        <AddNewLines key={innerKey} text={innerText} />
      )}
      fontSizeOverride={jumboEmojiSize}
      text={text}
    />
  );
}

/** @testexport */
export function extractLinks(
  originalMessageText: string,
  displayedTextLength: number
): ReadonlyArray<BodyRange<{ url: string }>> {
  // to support emojis immediately before links
  // we replace emojis with a space for each byte
  const matches = linkify
    .match(Emoji.replaceEmojiWithSpaces(originalMessageText))
    // Only linkify links that are fully visible
    ?.filter(match => match.lastIndex <= displayedTextLength);

  if (matches == null) {
    return [];
  }

  return matches.map(match => {
    return {
      start: match.index,
      length: match.lastIndex - match.index,
      url: match.url,
    };
  });
}
