import { Id } from "@/schema";
import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";

const frameId = Id.Frame.make("F1");
const nodeId = Id.Node.make("N1");
const hostNodeId = Id.Node.make("H1");
const propertyId = Id.Node.make("P1");
const tupleId = Id.Tuple.make("T1");

const decodeSync = Schema.decodeUnknownSync(Id.KhoraContextFromKhoraId);
const decodeEither = Schema.decodeUnknownEither(Id.KhoraContextFromKhoraId);
const attempt = (raw: string) => decodeEither(Id.Khora.make(raw));

describe("Id.KhoraContextFromKhoraId — frame variant", () => {
  const khoraId = Id.makeFrameKhoraId(frameId, nodeId);

  it("encodes to frame:{frameId}/node:{nodeId}", () => {
    expect(khoraId).toBe("frame:F1/node:N1");
  });

  it("decodes back to a frame context with the same IDs", () => {
    expect(decodeSync(khoraId)).toEqual({
      type: "frame",
      frameId,
      nodeId,
    });
  });
});

describe("Id.KhoraContextFromKhoraId — section variant", () => {
  const khoraId = Id.makePropertyKhoraId(
    frameId,
    hostNodeId,
    propertyId,
    tupleId,
  );

  it("encodes to frame:{frameId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}", () => {
    expect(khoraId).toBe("frame:F1/node:H1/property:P1/tuple:T1");
  });

  it("decodes back to a section context with the same IDs", () => {
    expect(decodeSync(khoraId)).toEqual({
      type: "section",
      frameId,
      hostNodeId,
      propertyId,
      tupleId,
    });
  });
});

describe("Id.KhoraContextFromKhoraId — propertyTitle variant", () => {
  const khoraId = Id.makePropertyTitleKhoraId(frameId, hostNodeId, propertyId);

  it("encodes to frame:{frameId}/node:{hostNodeId}/property:{propertyId}/title", () => {
    expect(khoraId).toBe("frame:F1/node:H1/property:P1/title");
  });

  it("decodes back to a propertyTitle context with the same IDs", () => {
    expect(decodeSync(khoraId)).toEqual({
      type: "propertyTitle",
      frameId,
      hostNodeId,
      propertyId,
    });
  });

  it("Schema.encode produces the same string as makePropertyTitleKhoraId", () => {
    const encoded = Schema.encodeSync(Id.KhoraContextFromKhoraId)({
      type: "propertyTitle",
      frameId,
      hostNodeId,
      propertyId,
    });
    expect(encoded).toBe(khoraId);
  });
});

describe("Id.KhoraContextFromKhoraId — invalid URIs", () => {
  it("rejects the empty string", () => {
    expect(Either.isLeft(attempt(""))).toBe(true);
  });

  it("rejects a string without the frame: prefix", () => {
    expect(Either.isLeft(attempt("not-a-khora"))).toBe(true);
  });

  it("rejects a frame-only URI missing /node:", () => {
    expect(Either.isLeft(attempt("frame:F1"))).toBe(true);
  });

  it("rejects a bare property path (neither /title nor /tuple:)", () => {
    expect(Either.isLeft(attempt("frame:F1/node:H1/property:P1"))).toBe(true);
  });

  it("rejects extra segments after /title (strict tail)", () => {
    expect(
      Either.isLeft(attempt("frame:F1/node:H1/property:P1/title/extra")),
    ).toBe(true);
  });

  it("rejects a typo in the /title literal", () => {
    expect(Either.isLeft(attempt("frame:F1/node:H1/property:P1/titlx"))).toBe(
      true,
    );
  });
});

describe("Id.khoraIdToNodeId", () => {
  it("returns nodeId for the frame variant", () => {
    const khoraId = Id.makeFrameKhoraId(frameId, nodeId);
    expect(Id.khoraIdToNodeId(khoraId)).toBe(nodeId);
  });

  it("returns hostNodeId for the section variant", () => {
    const khoraId = Id.makePropertyKhoraId(
      frameId,
      hostNodeId,
      propertyId,
      tupleId,
    );
    expect(Id.khoraIdToNodeId(khoraId)).toBe(hostNodeId);
  });

  it("returns propertyId for the propertyTitle variant", () => {
    const khoraId = Id.makePropertyTitleKhoraId(
      frameId,
      hostNodeId,
      propertyId,
    );
    expect(Id.khoraIdToNodeId(khoraId)).toBe(propertyId);
  });
});

describe("Id.parseKhoraContextSync", () => {
  it("throws on an invalid khoraId", () => {
    expect(() =>
      Id.parseKhoraContextSync(Id.Khora.make("not-a-khora")),
    ).toThrow();
  });
});
