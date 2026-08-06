import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineDistance,
  cosineSimilarity,
  dotProduct,
  innerProductDistance,
  squaredL2Distance
} from "../src/vector-math/distances.js";

test("calculates Chroma distance functions for the direction vectors", () => {
  const query = [1, 0];

  assert.equal(squaredL2Distance(query, [1, 0]), 0);
  assert.equal(squaredL2Distance(query, [1, 1]), 1);
  assert.equal(squaredL2Distance(query, [0, 1]), 2);

  assert.equal(cosineDistance(query, [1, 0]), 0);
  assert.ok(
    Math.abs(cosineDistance(query, [1, 1]) - (1 - 1 / Math.sqrt(2))) <
      1e-12
  );
  assert.equal(cosineDistance(query, [0, 1]), 1);

  assert.equal(innerProductDistance(query, [1, 0]), 0);
  assert.equal(innerProductDistance(query, [1, 1]), 0);
  assert.equal(innerProductDistance(query, [0, 1]), 1);
});

test("shows that cosine ignores magnitude while other distances do not", () => {
  assert.equal(cosineSimilarity([1, 0], [2, 0]), 1);
  assert.equal(cosineDistance([1, 0], [2, 0]), 0);
  assert.equal(squaredL2Distance([1, 0], [2, 0]), 1);
  assert.equal(dotProduct([1, 0], [2, 0]), 2);
  assert.equal(innerProductDistance([1, 0], [2, 0]), -1);
});

test("rejects invalid distance inputs", () => {
  assert.throws(
    () => squaredL2Distance([1], [1, 2]),
    /dimensions do not match/
  );
  assert.throws(
    () => dotProduct([Number.NaN], [1]),
    /finite values/
  );
  assert.throws(
    () => cosineDistance([0, 0], [1, 0]),
    /undefined for a zero vector/
  );
});
