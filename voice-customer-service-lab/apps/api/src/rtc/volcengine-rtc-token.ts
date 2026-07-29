/**
 * Compatible with the Volcengine RTC Token 001 format.
 * Portions Copyright 2025 Beijing Volcano Engine Technology Co., Ltd.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { createHmac } from "node:crypto";

const TOKEN_VERSION = "001";
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const RTC_ID_PATTERN = /^[A-Za-z0-9_@.-]{1,128}$/;

const PRIVILEGES = [
  0, // Publish stream
  1, // Publish audio
  2, // Publish video
  3, // Publish data
  4, // Subscribe stream
] as const;

export interface CreateVolcengineRtcTokenOptions {
  readonly appId: string;
  readonly appKey: string;
  readonly roomId: string;
  readonly userId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly nonce: number;
}

export function createVolcengineRtcToken(options: CreateVolcengineRtcTokenOptions): string {
  validateOptions(options);

  const message = Buffer.concat([
    uint32(options.nonce),
    uint32(options.issuedAt),
    uint32(options.expiresAt),
    string(options.roomId),
    string(options.userId),
    uint16(PRIVILEGES.length),
    ...PRIVILEGES.flatMap((privilege) => [uint16(privilege), uint32(options.expiresAt)]),
  ]);
  const signature = createHmac("sha256", options.appKey).update(message).digest();
  const content = Buffer.concat([bytes(message), bytes(signature)]);

  return `${TOKEN_VERSION}${options.appId}${content.toString("base64")}`;
}

function validateOptions(options: CreateVolcengineRtcTokenOptions): void {
  if (!/^[A-Za-z0-9]{24}$/.test(options.appId)) {
    throw new Error("RTC AppId must contain exactly 24 letters or digits.");
  }
  if (!options.appKey) {
    throw new Error("RTC AppKey must not be empty.");
  }
  for (const [name, value] of [
    ["roomId", options.roomId],
    ["userId", options.userId],
  ] as const) {
    if (!RTC_ID_PATTERN.test(value)) {
      throw new Error(`${name} must use 1-128 RTC-safe characters.`);
    }
  }
  assertUint32("issuedAt", options.issuedAt);
  assertUint32("expiresAt", options.expiresAt);
  assertUint32("nonce", options.nonce);
  if (options.expiresAt <= options.issuedAt) {
    throw new Error("RTC Token must expire after it is issued.");
  }
}

function bytes(value: Buffer): Buffer {
  if (value.length > UINT16_MAX) {
    throw new Error("RTC Token field is too large.");
  }
  return Buffer.concat([uint16(value.length), value]);
}

function string(value: string): Buffer {
  return bytes(Buffer.from(value, "utf8"));
}

function uint16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function assertUint32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
  }
}
