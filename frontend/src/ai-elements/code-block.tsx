// Adapted from https://github.com/vercel/ai-elements
// (packages/elements/src/code-block.tsx), trimmed to what src/ai-elements/tool.tsx
// actually uses (bare `<CodeBlock code language>` for JSON tool input/output) —
// dropped CodeBlockHeader/Title/Filename/Actions/CopyButton and the language
// selector (which pulled in shadcn's Select + Button, unused here). Syntax
// highlighting itself (shiki) is unchanged.
import { cn } from "../lib/utils";
import type { CSSProperties, HTMLAttributes } from "react";
import { createContext, memo, useEffect, useMemo, useRef, useState } from "react";
import type {
  BundledLanguage,
  BundledTheme,
  HighlighterGeneric,
  ThemedToken,
} from "shiki";
import { createHighlighter } from "shiki";

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) => fontStyle && fontStyle & 4;

interface KeyedToken {
  token: ThemedToken;
  key: string;
}
interface KeyedLine {
  tokens: KeyedToken[];
  key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }));

const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
        fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
        textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
        ...token.htmlStyle,
      } as CSSProperties
    }
  >
    {token.content}
  </span>
);

const LineSpan = ({ keyedLine }: { keyedLine: KeyedLine }) => (
  <span className="block">
    {keyedLine.tokens.length === 0
      ? "\n"
      : keyedLine.tokens.map(({ token, key }) => <TokenSpan key={key} token={token} />)}
  </span>
);

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
};

interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

interface CodeBlockContextType {
  code: string;
}

const CodeBlockContext = createContext<CodeBlockContextType>({ code: "" });

const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>();
const tokensCache = new Map<string, TokenizedCode>();
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const getTokensCacheKey = (code: string, language: BundledLanguage) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${code.length}:${start}:${end}`;
};

const getHighlighter = (language: BundledLanguage) => {
  const cached = highlighterCache.get(language);
  if (cached) return cached;
  const highlighterPromise = createHighlighter({
    langs: [language],
    themes: ["github-light", "github-dark"],
  });
  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

const createRawTokens = (code: string): TokenizedCode => ({
  bg: "transparent",
  fg: "inherit",
  tokens: code.split("\n").map((line) =>
    line === "" ? [] : [{ color: "inherit", content: line } as ThemedToken]
  ),
});

export const highlightCode = (
  code: string,
  language: BundledLanguage,
  callback?: (result: TokenizedCode) => void
): TokenizedCode | null => {
  const tokensCacheKey = getTokensCacheKey(code, language);
  const cached = tokensCache.get(tokensCacheKey);
  if (cached) return cached;

  if (callback) {
    if (!subscribers.has(tokensCacheKey)) subscribers.set(tokensCacheKey, new Set());
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  getHighlighter(language)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages();
      const langToUse = availableLangs.includes(language) ? language : "text";
      const result = highlighter.codeToTokens(code, {
        lang: langToUse,
        themes: { dark: "github-dark", light: "github-light" },
      });
      const tokenized: TokenizedCode = {
        bg: result.bg ?? "transparent",
        fg: result.fg ?? "inherit",
        tokens: result.tokens,
      };
      tokensCache.set(tokensCacheKey, tokenized);
      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) sub(tokenized);
        subscribers.delete(tokensCacheKey);
      }
    })
    .catch((error) => {
      console.error("Failed to highlight code:", error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

const CodeBlockBody = memo(
  ({ tokenized, className }: { tokenized: TokenizedCode; className?: string }) => {
    const preStyle = useMemo(
      () => ({ backgroundColor: tokenized.bg, color: tokenized.fg }),
      [tokenized.bg, tokenized.fg]
    );
    const keyedLines = useMemo(() => addKeysToTokens(tokenized.tokens), [tokenized.tokens]);

    return (
      <pre
        className={cn(
          "dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)] m-0 p-4 text-sm",
          className
        )}
        style={preStyle}
      >
        <code className="font-mono text-sm">
          {keyedLines.map((keyedLine) => (
            <LineSpan key={keyedLine.key} keyedLine={keyedLine} />
          ))}
        </code>
      </pre>
    );
  },
  (prev, next) => prev.tokenized === next.tokenized && prev.className === next.className
);
CodeBlockBody.displayName = "CodeBlockBody";

const CodeBlockContent = ({ code, language }: { code: string; language: BundledLanguage }) => {
  const rawTokens = useMemo(() => createRawTokens(code), [code]);
  const syncTokens = useMemo(() => highlightCode(code, language) ?? rawTokens, [code, language, rawTokens]);

  const [asyncTokens, setAsyncTokens] = useState<TokenizedCode | null>(null);
  const asyncKeyRef = useRef({ code, language });

  if (asyncKeyRef.current.code !== code || asyncKeyRef.current.language !== language) {
    asyncKeyRef.current = { code, language };
    setAsyncTokens(null);
  }

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language, (result) => {
      if (!cancelled) setAsyncTokens(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const tokenized = asyncTokens ?? syncTokens;

  return (
    <div className="relative overflow-auto">
      <CodeBlockBody tokenized={tokenized} />
    </div>
  );
};

export const CodeBlock = ({ code, language, className, children, ...props }: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
          className
        )}
        data-language={language}
        {...props}
      >
        {children}
        <CodeBlockContent code={code} language={language} />
      </div>
    </CodeBlockContext.Provider>
  );
};
