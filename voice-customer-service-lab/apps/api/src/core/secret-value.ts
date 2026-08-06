export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) {
      throw new Error("SecretValue cannot be empty");
    }
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}
