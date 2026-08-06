export interface TokenCounter {
  readonly name: string;
  count(text: string): number;
}

/** Conservative offline estimate; it deliberately leaves more room than a loose character ratio. */
export class ConservativeTokenCounter implements TokenCounter {
  readonly name = "conservative-offline-token-counter";

  count(text: string): number {
    let tokens = 0;
    let asciiRun = 0;
    const flushAscii = () => {
      if (asciiRun > 0) {
        tokens += Math.ceil(asciiRun / 4);
        asciiRun = 0;
      }
    };

    for (const character of text.normalize("NFKC")) {
      if (/^[A-Za-z0-9_]$/u.test(character)) {
        asciiRun += 1;
        continue;
      }
      flushAscii();
      if (!/\s/u.test(character)) {
        // CJK characters, punctuation and other symbols are each counted conservatively.
        tokens += 1;
      }
    }
    flushAscii();
    return tokens;
  }
}
