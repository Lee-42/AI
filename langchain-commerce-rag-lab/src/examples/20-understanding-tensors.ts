import {
  describeTensor,
  flattenTensor,
  formatTensorShape,
  tensorValueAt,
  type NumericTensor
} from "../tensors/tensor-shape.js";

const scalar = 36.5;
const vector = [0.2, -0.1, 0.8];
const matrix = [
  [1, 2, 3],
  [4, 5, 6]
];

// 2 行 × 3 列 × RGB 3 通道的微型图片。
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

function printDescription(name: string, value: NumericTensor): void {
  const description = describeTensor(value);

  console.log(
    `${name.padEnd(8)} shape=${formatTensorShape(description.shape).padEnd(13)}` +
      ` rank=${description.rank} elements=${description.elementCount}`
  );
}

function main(): void {
  console.log("20 如何理解机器学习中的张量？");
  console.log("");
  console.log("从标量到图片张量");
  printDescription("标量", scalar);
  printDescription("向量", vector);
  printDescription("矩阵", matrix);
  printDescription("RGB图片", image);

  const imageDescription = describeTensor(image);
  const imageBatch: NumericTensor = [image, image];
  const batchDescription = describeTensor(imageBatch);
  const flattenedImage = flattenTensor(image);

  console.log("");
  console.log("RGB 图片的三个轴");
  console.log(`axis 0 高度: ${imageDescription.shape[0]}`);
  console.log(`axis 1 宽度: ${imageDescription.shape[1]}`);
  console.log(`axis 2 通道: ${imageDescription.shape[2]} (R, G, B)`);
  console.log(
    `像素 [0,1] 的 RGB: [` +
      [0, 1, 2].map((channel) =>
        tensorValueAt(image, [0, 1, channel])
      ).join(", ") +
      "]"
  );

  console.log("");
  console.log("增加 batch 轴");
  console.log(
    `2 张图片: shape=${formatTensorShape(batchDescription.shape)} ` +
      `rank=${batchDescription.rank}`
  );

  console.log("");
  console.log("图片像素与 Embedding 不是同一个东西");
  console.log(
    `原图片: shape=${formatTensorShape(imageDescription.shape)}, ` +
      `${imageDescription.elementCount} 个通道值`
  );
  console.log(
    `直接 flatten: shape=[${flattenedImage.length}]，只改变排列方式`
  );
  console.log("多模态模型: 图片张量 -> 经过学习的语义向量 [2048]");
  console.log("Chroma 3 条图片记录的 embeddings 参数: shape=[3 × 2048]");
  console.log("一次文字查询的 queryEmbeddings 参数: shape=[1 × 2048]");

  console.log("");
  console.log("容易混淆的三个 dimension");
  console.log("rank/ndim: 轴的数量，例如 RGB 图片是 3");
  console.log("shape: 每个轴的长度，例如 [2 × 3 × 3]");
  console.log("embedding dimension: 向量分量数，例如 2048");

  console.log("");
  console.log("外部调用: 0");
}

main();
