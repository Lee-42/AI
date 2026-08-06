import assert from "node:assert/strict";
import test from "node:test";
import {
  describeTensor,
  flattenTensor,
  formatTensorShape,
  inferTensorShape,
  tensorElementCount,
  tensorValueAt,
  type NumericTensor
} from "../src/tensors/tensor-shape.js";

const image: NumericTensor = [
  [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255]
  ],
  [
    [255, 255, 255],
    [0, 0, 0],
    [255, 255, 0]
  ]
];

test("describes scalars, vectors, and matrices", () => {
  assert.deepEqual(describeTensor(7), {
    shape: [],
    rank: 0,
    elementCount: 1
  });
  assert.deepEqual(describeTensor([1, 2, 3]), {
    shape: [3],
    rank: 1,
    elementCount: 3
  });
  assert.deepEqual(
    describeTensor([
      [1, 2, 3],
      [4, 5, 6]
    ]),
    {
      shape: [2, 3],
      rank: 2,
      elementCount: 6
    }
  );
});

test("infers HWC image and NHWC batch shapes", () => {
  assert.deepEqual(inferTensorShape(image), [2, 3, 3]);
  assert.deepEqual(inferTensorShape([image, image]), [2, 2, 3, 3]);
  assert.equal(tensorElementCount([2, 3, 3]), 18);
  assert.equal(formatTensorShape([2, 3, 3]), "[2 × 3 × 3]");
});

test("reads a scalar through one index per axis", () => {
  assert.equal(tensorValueAt(image, [0, 1, 0]), 0);
  assert.equal(tensorValueAt(image, [0, 1, 1]), 255);
  assert.equal(tensorValueAt(image, [0, 1, 2]), 0);
});

test("flattens values without changing their order or count", () => {
  const flattened = flattenTensor(image);

  assert.equal(flattened.length, 18);
  assert.deepEqual(flattened.slice(0, 9), [
    255, 0, 0,
    0, 255, 0,
    0, 0, 255
  ]);
});

test("rejects jagged, empty, non-numeric, and non-finite tensors", () => {
  assert.throws(
    () => inferTensorShape([[1, 2], [3]]),
    /is jagged/
  );
  assert.throws(() => inferTensorShape([]), /empty axis/);
  assert.throws(() => inferTensorShape([[1, "2"]]), /number or/);
  assert.throws(() => inferTensorShape([1, Number.NaN]), /finite/);
});

test("rejects incomplete or out-of-bounds indices", () => {
  assert.throws(
    () => tensorValueAt(image, [0, 1]),
    /Expected 3 indices/
  );
  assert.throws(
    () => tensorValueAt(image, [2, 0, 0]),
    /out of bounds for axis 0/
  );
});

test("validates shape sizes before calculating element count", () => {
  assert.equal(tensorElementCount([]), 1);
  assert.equal(tensorElementCount([0, 3]), 0);
  assert.throws(
    () => tensorElementCount([2, -1]),
    /non-negative safe integer/
  );
});
