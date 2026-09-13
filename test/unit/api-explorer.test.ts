import { describe, expect, it } from "vitest";
import {
  authRequirement,
  buildCurl,
  buildRequestPlan,
  derefSchema,
  describeSchema,
  emptyValues,
  exampleFor,
  filterGroups,
  indexOperations,
  isDestructive,
  matchesQuery,
  methodChipClass,
  type OpenApiDoc,
  resolveRef,
  responseRender,
  tryItDescriptor,
} from "@/components/api/spec";
import { openapi } from "@/lib/openapi";

/**
 * The API explorer's pure module, tested against both a synthetic document (for the awkward
 * shapes — `allOf`, recursion) and against the product's real contract.
 *
 * The last block is the point of the file: every operation the contract declares has to index,
 * describe and produce a working try-it form. That is what stops the explorer quietly missing an
 * operation somebody added to `lib/openapi.ts` last week.
 */

const doc = openapi as unknown as OpenApiDoc;

const synthetic: OpenApiDoc = {
  info: { title: "Synthetic", version: "1.0.0" },
  tags: [{ name: "Beta" }, { name: "Alpha" }],
  paths: {
    "/things/{id}": {
      get: {
        operationId: "getThing",
        tags: ["Alpha"],
        summary: "Get a thing",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "depth", in: "query", schema: { type: "integer", default: 2 } },
          { name: "kind", in: "query", schema: { type: "string", enum: ["a", "b"] } },
          { name: "deep", in: "query", schema: { type: "boolean" } },
          { name: "tag", in: "query", schema: { type: "array", items: { type: "string" } } },
        ],
        responses: { 200: { description: "OK" } },
      },
      delete: {
        operationId: "deleteThing",
        tags: ["Beta"],
        summary: "Delete a thing",
        security: [{ AdminToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: { description: "Gone" } },
      },
    },
    "/things": {
      post: {
        operationId: "createThing",
        tags: ["Alpha"],
        summary: "Create a thing",
        security: [{ ApiKey: [] }, { AdminToken: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ThingCreate" } } },
        },
        responses: { 201: { description: "Made" } },
      },
    },
  },
  components: {
    schemas: {
      Base: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, note: { type: "string" } },
      },
      Thing: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          {
            type: "object",
            required: ["size"],
            properties: { size: { type: "integer" }, child: { $ref: "#/components/schemas/Thing" } },
          },
        ],
      },
      ThingCreate: {
        type: "object",
        required: ["name", "mode"],
        properties: {
          name: { type: "string" },
          mode: { type: "string", enum: ["fast", "slow"] },
          retries: { type: "integer", default: 3 },
          startsAt: { type: "string", format: "date-time" },
          tags: { type: "array", items: { type: "string" }, minItems: 1 },
          extra: { type: "string" },
        },
      },
      Node: {
        type: "object",
        required: ["value"],
        properties: {
          value: { type: "string" },
          children: { type: "array", items: { $ref: "#/components/schemas/Node" } },
        },
      },
    },
  },
};

describe("$ref resolution", () => {
  it("resolves a local pointer and unescapes the pointer grammar", () => {
    expect(resolveRef(synthetic, "#/components/schemas/Base")?.type).toBe("object");
    expect(resolveRef(synthetic, "#/components/schemas/Missing")).toBeUndefined();
    expect(resolveRef(synthetic, "https://elsewhere/schema")).toBeUndefined();
    expect(resolveRef(doc, "#/components/schemas/Problem")?.type).toBe("object");
  });

  it("flattens allOf into one schema, unioning properties and required", () => {
    const { schema } = derefSchema(synthetic, { $ref: "#/components/schemas/Thing" });
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["child", "id", "note", "size"]);
    expect((schema.required ?? []).sort()).toEqual(["id", "size"]);
  });

  it("flattens the real document's allOf (CallDetail extends CallSummary)", () => {
    const { schema } = derefSchema(doc, { $ref: "#/components/schemas/CallDetail" });
    const props = Object.keys(schema.properties ?? {});
    expect(props).toContain("title"); // from CallSummary
    expect(props).toContain("paragraphs"); // from the CallDetail branch
    expect(schema.required).toContain("id");
    expect(schema.required).toContain("transcriptText");
  });

  it("stops on a self-referencing schema instead of recursing for ever", () => {
    const node = describeSchema(synthetic, { $ref: "#/components/schemas/Node" });
    expect(node.kind).toBe("object");
    const children = node.fields.find((f) => f.name === "children");
    expect(children?.node.items?.kind).toBe("circular");
    expect(children?.node.items?.type).toContain("recursive");
  });

  it("describes a sibling reference twice rather than treating the second as a cycle", () => {
    const node = describeSchema(doc, { $ref: "#/components/schemas/Dashboard" });
    const reason = node.fields.find((f) => f.name === "byReason");
    const sentiment = node.fields.find((f) => f.name === "bySentiment");
    expect(reason?.node.items?.fields.map((f) => f.name)).toEqual(["name", "value"]);
    expect(sentiment?.node.items?.fields.map((f) => f.name)).toEqual(["name", "value"]);
  });

  it("names free-form maps by their value type", () => {
    const node = describeSchema(doc, { $ref: "#/components/schemas/CacheStats" });
    const byNamespace = node.fields.find((f) => f.name === "byNamespace");
    expect(byNamespace?.node.kind).toBe("map");
    expect(byNamespace?.node.type).toBe("map of integer");
  });
});

describe("example generation", () => {
  it("honours required, enum, default and format, and caps optional fields", () => {
    const example = exampleFor(synthetic, { $ref: "#/components/schemas/ThingCreate" }) as Record<
      string,
      unknown
    >;
    expect(example.name).toBe("string");
    expect(example.mode).toBe("fast"); // first enum value
    expect(example.retries).toBe(3); // the declared default, not a synthesised number
    expect(example.startsAt).toBe("2026-01-01T00:00:00.000Z");
    expect(example.tags).toEqual(["string"]);
  });

  it("keeps every required field even past the optional cap", () => {
    const example = exampleFor(synthetic, { $ref: "#/components/schemas/ThingCreate" }, { maxOptional: 1 });
    expect(Object.keys(example as object).sort()).toEqual(["mode", "name", "retries"]);
  });

  it("clamps numbers into the declared range", () => {
    expect(exampleFor(synthetic, { type: "integer", minimum: 1000, maximum: 5000 })).toBe(1000);
    expect(exampleFor(synthetic, { type: "integer", maximum: -4 })).toBe(-4);
  });

  it("terminates on a recursive schema", () => {
    const example = exampleFor(synthetic, { $ref: "#/components/schemas/Node" }) as Record<string, unknown>;
    expect(example.value).toBe("string");
    expect(JSON.stringify(example)).toBeTypeOf("string");
  });

  it("produces a body a caller could actually send for a real operation", () => {
    const index = indexOperations(doc);
    const op = index.operations.find((o) => o.operationId === "askCall");
    if (!op) throw new Error("askCall is missing from the contract");
    const desc = tryItDescriptor(doc, op);
    expect(desc.body.kind).toBe("json");
    expect(JSON.parse(desc.body.example ?? "")).toEqual({ question: "string" });
  });
});

describe("indexing, grouping and filtering", () => {
  it("groups by the first tag, in the document's declared tag order", () => {
    const index = indexOperations(synthetic);
    expect(index.declared).toBe(3);
    expect(index.groups.map((g) => g.name)).toEqual(["Beta", "Alpha"]);
    expect(index.groups[1]?.operations.map((o) => o.id)).toEqual(["getThing", "createThing"]);
  });

  it("matches the filter on method, path, summary and operation id", () => {
    const [op] = indexOperations(synthetic).operations;
    if (!op) throw new Error("no operations");
    expect(matchesQuery(op, "")).toBe(true);
    expect(matchesQuery(op, "GET")).toBe(true);
    expect(matchesQuery(op, "/things/")).toBe(true);
    expect(matchesQuery(op, "getthing")).toBe(true);
    expect(matchesQuery(op, "get thing")).toBe(true);
    expect(matchesQuery(op, "delete")).toBe(false);
  });

  it("drops groups the filter empties", () => {
    const index = indexOperations(synthetic);
    expect(filterGroups(index.groups, "delete").map((g) => g.name)).toEqual(["Beta"]);
    expect(filterGroups(index.groups, "nothing-matches-this")).toEqual([]);
  });
});

describe("authentication and safety", () => {
  it("reads the security block into plain words", () => {
    const index = indexOperations(synthetic);
    const byId = (id: string) => {
      const op = index.operations.find((o) => o.id === id);
      if (!op) throw new Error(`${id} missing`);
      return authRequirement(op);
    };
    expect(byId("getThing").kind).toBe("public");
    expect(byId("deleteThing").kind).toBe("admin");
    expect(byId("deleteThing").label).toBe("The admin token");
    expect(byId("createThing").kind).toBe("api-key-or-admin");
    expect(authRequirement({ security: [{ ApiKey: [] }] } as never).kind).toBe("api-key");
  });

  it("treats every DELETE, and the retention purge, as destructive", () => {
    expect(isDestructive("delete", "/api/v1/views/{id}")).toBe(true);
    expect(isDestructive("POST", "/api/v1/retention/purge")).toBe(true);
    expect(isDestructive("POST", "/api/v1/samples")).toBe(false);
    expect(isDestructive("GET", "/api/v1/calls")).toBe(false);
  });

  it("colours the method badge by what it does, not one colour per verb", () => {
    expect(methodChipClass("GET")).toBe(methodChipClass("HEAD"));
    expect(methodChipClass("PUT")).toBe(methodChipClass("PATCH"));
    expect(methodChipClass("DELETE")).toContain("danger");
  });
});

describe("form descriptors and request building", () => {
  const index = indexOperations(synthetic);
  const getThing = index.operations.find((o) => o.id === "getThing");
  if (!getThing) throw new Error("getThing missing");
  const desc = tryItDescriptor(synthetic, getThing);

  it("picks a control per parameter type", () => {
    const controls = Object.fromEntries(desc.queryFields.map((f) => [f.name, f.control]));
    expect(controls).toEqual({ depth: "number", kind: "select", deep: "checkbox", tag: "array" });
    expect(desc.pathFields.map((f) => f.name)).toEqual(["id"]);
    expect(desc.queryFields.find((f) => f.name === "depth")?.initial).toBe("2");
    expect(desc.queryFields.find((f) => f.name === "kind")?.options).toEqual(["a", "b"]);
  });

  it("substitutes path parameters, omits blank query values and repeats arrays", () => {
    const plan = buildRequestPlan(desc, {
      ...emptyValues(desc),
      path: { id: "abc 1" },
      query: { depth: "5", kind: "", deep: "true", tag: ["x", "", "y"] },
    });
    expect(plan.url).toBe("/things/abc%201?depth=5&deep=true&tag=x&tag=y");
    expect(plan.missing).toEqual([]);
  });

  it("reports a blank required path parameter rather than sending a broken URL", () => {
    const plan = buildRequestPlan(desc, emptyValues(desc));
    expect(plan.missing).toEqual(["id"]);
    expect(plan.path).toBe("/things/{id}");
  });
});

describe("curl building", () => {
  const index = indexOperations(synthetic);
  const create = index.operations.find((o) => o.id === "createThing");
  if (!create) throw new Error("createThing missing");
  const desc = tryItDescriptor(synthetic, create);

  it("renders the exact request", () => {
    const plan = buildRequestPlan(desc, { ...emptyValues(desc), body: '{"name":"x"}' });
    const curl = buildCurl(plan, { origin: "https://example.test" });
    expect(curl).toContain("curl -X POST 'https://example.test/things'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain(`-d '{"name":"x"}'`);
  });

  it("redacts the pasted key instead of printing it", () => {
    const secret = "ca_live_supersecretvalue";
    const plan = buildRequestPlan(desc, { ...emptyValues(desc), body: "{}", apiKey: true });
    const curl = buildCurl(plan, { origin: "", apiKey: secret });
    expect(curl).toContain('-H "X-API-Key: $CALL_ANALYSIS_API_KEY"');
    expect(curl).not.toContain(secret);
    expect(curl).not.toContain("supersecret");
  });

  it("shell-quotes values that would otherwise break out of the argument", () => {
    const plan = buildRequestPlan(desc, { ...emptyValues(desc), body: `{"note":"it's fine"}` });
    expect(buildCurl(plan)).toContain(`-d '{"note":"it'\\''s fine"}'`);
  });

  it("renders multipart bodies as -F, files by name", () => {
    const index2 = indexOperations(doc);
    const upload = index2.operations.find((o) => o.operationId === "createCall");
    if (!upload) throw new Error("createCall missing");
    const uploadDesc = tryItDescriptor(doc, upload);
    expect(uploadDesc.body.kind).toBe("multipart");
    expect(uploadDesc.body.fields.find((f) => f.name === "recording")?.kind).toBe("file");
    const plan = buildRequestPlan(uploadDesc, {
      ...emptyValues(uploadDesc),
      form: { title: "Renewal call" },
      files: { recording: "call.wav" },
    });
    const curl = buildCurl(plan);
    expect(curl).toContain("-F 'title=Renewal call'");
    expect(curl).toContain("-F 'recording=@call.wav'");
    expect(curl).not.toContain("Content-Type: multipart");
  });
});

describe("response rendering decisions", () => {
  it("routes a body by its content type", () => {
    expect(responseRender("application/problem+json; charset=utf-8")).toBe("problem");
    expect(responseRender("application/json")).toBe("json");
    expect(responseRender("application/x-ndjson")).toBe("text");
    expect(responseRender("text/event-stream")).toBe("text");
    expect(responseRender("text/csv")).toBe("text");
    expect(responseRender("audio/wav")).toBe("binary");
    expect(responseRender("application/octet-stream")).toBe("binary");
    expect(responseRender("")).toBe("binary");
  });
});

/**
 * The coverage guarantee. Every operation in the shipped contract must be indexed, describable and
 * exercisable — if an operation is added to `lib/openapi.ts` and the explorer cannot render it,
 * this fails rather than the operation quietly going missing from the screen.
 */
describe("the whole contract", () => {
  const index = indexOperations(doc);

  it("indexes every operation the document declares", () => {
    const declared = Object.values(doc.paths ?? {}).flatMap((item) =>
      Object.keys(item).filter((k) =>
        ["get", "put", "post", "delete", "patch", "head", "options"].includes(k),
      ),
    );
    expect(index.declared).toBe(declared.length);
    expect(index.declared).toBeGreaterThanOrEqual(60);
    expect(index.groups.reduce((n, g) => n + g.operations.length, 0)).toBe(index.declared);
  });

  it("gives every operation a unique id, a tag the document declares and a summary", () => {
    const tags = new Set((doc.tags ?? []).map((t) => t.name));
    const ids = new Set<string>();
    for (const op of index.operations) {
      expect(op.id, `${op.method} ${op.path}`).toBeTruthy();
      expect(ids.has(op.id), `duplicate id ${op.id}`).toBe(false);
      ids.add(op.id);
      expect(op.summary, `${op.method} ${op.path}`).toBeTruthy();
      expect(tags.has(op.tag), `${op.tag} is not a declared tag`).toBe(true);
    }
  });

  it("produces a try-it descriptor, a request plan and a curl for every operation", () => {
    for (const op of index.operations) {
      const where = `${op.method} ${op.path}`;
      const desc = tryItDescriptor(doc, op);
      expect(desc.auth.label, where).toBeTruthy();

      // Every path placeholder has a form field to fill it.
      const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      expect(desc.pathFields.map((f) => f.name).sort(), where).toEqual([...placeholders].sort());

      // A JSON body is prefilled with something that parses.
      if (desc.body.kind === "json") {
        expect(desc.body.example, where).toBeTruthy();
        expect(() => JSON.parse(desc.body.example ?? ""), where).not.toThrow();
      }

      const values = emptyValues(desc);
      const filled = {
        ...values,
        path: Object.fromEntries(desc.pathFields.map((f) => [f.name, "sample"])),
      };
      const plan = buildRequestPlan(desc, filled);
      expect(plan.missing, where).toEqual([]);
      expect(plan.url.includes("{"), where).toBe(false);
      expect(buildCurl(plan, { origin: "https://example.test" }), where).toContain(`curl -X ${op.method}`);
    }
  });

  it("describes every request and response schema without throwing or looping", () => {
    for (const op of index.operations) {
      for (const content of op.requestBody?.contents ?? []) {
        expect(() => describeSchema(doc, content.schema)).not.toThrow();
      }
      for (const response of op.responses) {
        for (const content of response.contents) {
          const node = describeSchema(doc, content.schema);
          expect(node.type, `${op.method} ${op.path} ${response.status}`).toBeTruthy();
        }
      }
    }
  });

  it("generates an example for every JSON request body in the contract", () => {
    const jsonBodies = index.operations.filter((op) => tryItDescriptor(doc, op).body.kind === "json");
    expect(jsonBodies.length).toBeGreaterThan(5);
    for (const op of jsonBodies) {
      const example = JSON.parse(tryItDescriptor(doc, op).body.example ?? "");
      expect(example, `${op.method} ${op.path}`).toBeTypeOf("object");
    }
  });
});
