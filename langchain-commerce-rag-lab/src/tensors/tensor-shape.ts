export type NumericTensor = number | NumericTensor[];

export type TensorDescription = {
  shape: number[];
  rank: number;
  elementCount: number;
};

function sameShape(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((size, index) => size === right[index])
  );
}

export function inferTensorShape(
  value: unknown,
  path = "tensor"
): number[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must contain only finite numbers`);
    }

    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be a number or a nested number array`);
  }

  if (value.length === 0) {
    throw new Error(`${path} must not contain an empty axis`);
  }

  const childShapes = value.map((child, index) =>
    inferTensorShape(child, `${path}[${index}]`)
  );
  const firstShape = childShapes[0];

  if (!firstShape) {
    throw new Error(`${path} must not be empty`);
  }

  childShapes.forEach((shape, index) => {
    if (!sameShape(shape, firstShape)) {
      throw new Error(
        `${path} is jagged at index ${index}; every item on an axis must have the same shape`
      );
    }
  });

  return [value.length, ...firstShape];
}

export function tensorElementCount(shape: number[]): number {
  shape.forEach((size, index) => {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(
        `Shape size at axis ${index} must be a non-negative safe integer`
      );
    }
  });

  // 标量 shape 为 []，但仍包含一个数值。
  return shape.reduce((total, size) => total * size, 1);
}

export function describeTensor(value: NumericTensor): TensorDescription {
  const shape = inferTensorShape(value);

  return {
    shape,
    rank: shape.length,
    elementCount: tensorElementCount(shape)
  };
}

export function flattenTensor(value: NumericTensor): number[] {
  inferTensorShape(value);
  const flattened: number[] = [];

  function visit(current: NumericTensor): void {
    if (typeof current === "number") {
      flattened.push(current);
      return;
    }

    current.forEach(visit);
  }

  visit(value);
  return flattened;
}

export function tensorValueAt(
  value: NumericTensor,
  indices: number[]
): number {
  const shape = inferTensorShape(value);

  if (indices.length !== shape.length) {
    throw new Error(
      `Expected ${shape.length} indices for shape ${formatTensorShape(shape)}, received ${indices.length}`
    );
  }

  let current: NumericTensor = value;

  indices.forEach((index, axis) => {
    const axisSize = shape[axis];

    if (
      axisSize === undefined ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= axisSize
    ) {
      throw new Error(
        `Index ${String(index)} is out of bounds for axis ${axis} with size ${String(axisSize)}`
      );
    }

    if (!Array.isArray(current)) {
      throw new Error(`Axis ${axis} does not exist`);
    }

    const next = current[index];

    if (next === undefined) {
      throw new Error(`Tensor value is missing at axis ${axis}`);
    }

    current = next;
  });

  if (typeof current !== "number") {
    throw new Error("Tensor indices did not resolve to a scalar");
  }

  return current;
}

export function formatTensorShape(shape: number[]): string {
  return `[${shape.join(" × ")}]`;
}
