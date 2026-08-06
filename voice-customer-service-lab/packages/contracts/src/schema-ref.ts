import { type Static, type TSchema, Type } from "typebox";

export function schemaRef<const TType extends TSchema>(schema: TType) {
  const identifier = (schema as TSchema & { $id?: unknown }).$id;
  if (typeof identifier !== "string") {
    throw new Error("A referenced schema must define $id.");
  }

  return Type.Unsafe<Static<TType>>({ $ref: identifier });
}
