function validateVectorPair(
  left: readonly number[],
  right: readonly number[]
): void {
  if (left.length === 0 || right.length === 0) {
    throw new Error("Distance vectors must not be empty");
  }

  if (left.length !== right.length) {
    throw new Error(
      `Vector dimensions do not match: ${left.length} and ${right.length}`
    );
  }

  if (
    [...left, ...right].some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Distance vectors must contain finite values");
  }
}

export function dotProduct(
  left: readonly number[],
  right: readonly number[]
): number {
  validateVectorPair(left, right);

  return left.reduce((sum, value, index) => {
    return sum + value * (right[index] as number);
  }, 0);
}

export function squaredL2Distance(
  left: readonly number[],
  right: readonly number[]
): number {
  validateVectorPair(left, right);

  return left.reduce((sum, value, index) => {
    const difference = value - (right[index] as number);
    return sum + difference * difference;
  }, 0);
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[]
): number {
  validateVectorPair(left, right);

  const leftLength = Math.sqrt(dotProduct(left, left));
  const rightLength = Math.sqrt(dotProduct(right, right));

  if (leftLength === 0 || rightLength === 0) {
    throw new Error("Cosine distance is undefined for a zero vector");
  }

  return dotProduct(left, right) / (leftLength * rightLength);
}

export function cosineDistance(
  left: readonly number[],
  right: readonly number[]
): number {
  return 1 - cosineSimilarity(left, right);
}

export function innerProductDistance(
  left: readonly number[],
  right: readonly number[]
): number {
  return 1 - dotProduct(left, right);
}
