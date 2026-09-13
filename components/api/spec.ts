/**
 * The API explorer's logic, with no React and no DOM in it.
 *
 * Everything the screen needs from the OpenAPI 3.1 document — indexing operations by tag,
 * resolving `$ref`s, describing a schema as a field tree, generating a request example, building
 * the request and its curl — lives here so it can be unit-tested against the real document. The
 * coverage guarantee in `test/unit/api-explorer.test.ts` is exactly that: every operation the
 * contract declares must index and produce a try-it form descriptor without throwing.
 *
 * Nothing in this module ever receives, stores or prints a credential: `buildCurl` is handed the
 * pasted key only so it can decide whether to emit the placeholder, and it emits the placeholder.
 */

// ───────────────────────────── document shapes ─────────────────────────────

export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  examples?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
}

export interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
  security?: Array<Record<string, string[]>>;
}

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "OPTIONS" | "HEAD" | "PATCH" | "TRACE";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export interface ApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

export interface MediaEntry {
  mediaType: string;
  schema?: JsonSchema;
}

export interface ApiRequestBody {
  required: boolean;
  description?: string;
  contents: MediaEntry[];
}

export interface ApiResponse {
  status: string;
  description: string;
  contents: MediaEntry[];
}

export interface ApiOperation {
  /** Stable identifier used in `?op=`; the operationId when the document declares one. */
  id: string;
  operationId?: string;
  method: HttpMethod;
  path: string;
  /** First declared tag, or "Other" — the group this operation is listed under. */
  tag: string;
  tags: string[];
  summary: string;
  description: string;
  deprecated: boolean;
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
  security?: Array<Record<string, string[]>>;
  destructive: boolean;
}

export interface TagGroup {
  name: string;
  description?: string;
  operations: ApiOperation[];
}

export interface ApiIndex {
  title: string;
  version: string;
  operations: ApiOperation[];
  groups: TagGroup[];
  /** Operations the document declares. Equal to `operations.length` by construction. */
  declared: number;
}

// ───────────────────────────── $ref resolution ─────────────────────────────

/** Resolve a local JSON pointer (`#/components/schemas/X`). Foreign refs are not supported. */
export function resolveRef(doc: OpenApiDoc, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = doc;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node && typeof node === "object" ? (node as JsonSchema) : undefined;
}

export interface Deref {
  schema: JsonSchema;
  /** Name of the last `#/components/schemas/*` hop, for display. */
  refName?: string;
  /** The chain closed on itself; the caller must stop rather than recurse. */
  circular: boolean;
  /** Refs already followed on this branch, to be passed down to children. */
  seen: ReadonlySet<string>;
}

/**
 * Follow `$ref` hops and flatten `allOf` into one schema.
 *
 * `seen` is per-branch rather than global: two sibling properties may both point at the same
 * schema without either being recursive, and a global set would wrongly cut the second one off.
 */
export function derefSchema(
  doc: OpenApiDoc,
  schema: JsonSchema | undefined,
  seen: ReadonlySet<string> = new Set(),
): Deref {
  const path = new Set(seen);
  let node: JsonSchema = schema ?? {};
  let refName: string | undefined;
  while (typeof node.$ref === "string") {
    const ref = node.$ref;
    refName = ref.split("/").pop() ?? ref;
    if (path.has(ref)) return { schema: {}, refName, circular: true, seen: path };
    path.add(ref);
    const target = resolveRef(doc, ref);
    if (!target) return { schema: {}, refName, circular: false, seen: path };
    node = target;
  }
  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    return { schema: mergeAllOf(doc, node, path), refName, circular: false, seen: path };
  }
  return { schema: node, refName, circular: false, seen: path };
}

function mergeAllOf(doc: OpenApiDoc, node: JsonSchema, seen: ReadonlySet<string>): JsonSchema {
  const { allOf = [], ...rest } = node;
  const out: JsonSchema = { ...rest };
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  for (const member of allOf) {
    const merged = derefSchema(doc, member, seen).schema;
    if (merged.type && !out.type) out.type = merged.type;
    if (merged.description && !out.description) out.description = merged.description;
    if (merged.additionalProperties !== undefined && out.additionalProperties === undefined)
      out.additionalProperties = merged.additionalProperties;
    Object.assign(properties, merged.properties ?? {});
    for (const name of merged.required ?? []) required.add(name);
  }
  // The node's own properties win over the branches it composes, which is what an author means
  // by narrowing a shared schema in place.
  Object.assign(properties, rest.properties ?? {});
  for (const name of rest.required ?? []) required.add(name);
  if (Object.keys(properties).length > 0) {
    out.properties = properties;
    if (!out.type) out.type = "object";
  }
  if (required.size > 0) out.required = [...required];
  return out;
}

// ───────────────────────────── schema description ─────────────────────────────

export type SchemaKind = "object" | "array" | "map" | "scalar" | "any" | "circular";

export interface SchemaField {
  name: string;
  required: boolean;
  node: SchemaNode;
}

export interface SchemaNode {
  kind: SchemaKind;
  /** Display type, e.g. `string`, `integer`, `CallSummary`, `array of CallSummary`. */
  type: string;
  ref?: string;
  description?: string;
  enumValues?: string[];
  format?: string;
  default?: unknown;
  /** Human-readable constraints (`min 1`, `max 200 characters`, a pattern). */
  constraints: string[];
  fields: SchemaField[];
  items?: SchemaNode;
  /** `additionalProperties` schema, for free-form maps. */
  values?: SchemaNode;
  nullable: boolean;
}

const MAX_DEPTH = 8;

function primaryType(schema: JsonSchema): string | undefined {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x) => x !== "null");
  return t;
}

function constraintsOf(schema: JsonSchema): string[] {
  const out: string[] = [];
  if (typeof schema.minimum === "number") out.push(`min ${schema.minimum}`);
  if (typeof schema.maximum === "number") out.push(`max ${schema.maximum}`);
  if (typeof schema.minLength === "number") out.push(`min ${schema.minLength} characters`);
  if (typeof schema.maxLength === "number") out.push(`max ${schema.maxLength} characters`);
  if (typeof schema.minItems === "number") out.push(`min ${schema.minItems} items`);
  if (typeof schema.maxItems === "number") out.push(`max ${schema.maxItems} items`);
  if (typeof schema.pattern === "string") out.push(`pattern ${schema.pattern}`);
  return out;
}

/** Turn a schema into a finite tree a screen can render. Cycles and depth are both bounded. */
export function describeSchema(
  doc: OpenApiDoc,
  schema: JsonSchema | undefined,
  seen: ReadonlySet<string> = new Set(),
  depth = 0,
): SchemaNode {
  const d = derefSchema(doc, schema, seen);
  const s = d.schema;
  const base = {
    ref: d.refName,
    description: s.description,
    format: s.format,
    default: s.default,
    constraints: constraintsOf(s),
    fields: [] as SchemaField[],
    nullable: s.nullable === true || (Array.isArray(s.type) && s.type.includes("null")),
    enumValues: Array.isArray(s.enum) ? s.enum.map((v) => String(v)) : undefined,
  };
  if (d.circular) {
    return { ...base, kind: "circular", type: `${d.refName ?? "schema"} (recursive)` };
  }
  if (depth >= MAX_DEPTH) {
    return { ...base, kind: "any", type: d.refName ?? primaryType(s) ?? "…" };
  }

  const type = primaryType(s);
  if (type === "array" || s.items) {
    const items = describeSchema(doc, s.items, d.seen, depth + 1);
    return { ...base, kind: "array", type: `array of ${items.type}`, items };
  }
  if (type === "object" || s.properties || s.additionalProperties) {
    const required = new Set(s.required ?? []);
    const fields: SchemaField[] = Object.entries(s.properties ?? {}).map(([name, sub]) => ({
      name,
      required: required.has(name),
      node: describeSchema(doc, sub, d.seen, depth + 1),
    }));
    const values =
      s.additionalProperties && typeof s.additionalProperties === "object"
        ? describeSchema(doc, s.additionalProperties, d.seen, depth + 1)
        : undefined;
    const kind: SchemaKind = fields.length === 0 && values ? "map" : "object";
    const label = d.refName ?? (kind === "map" ? `map of ${values?.type ?? "any"}` : "object");
    return { ...base, kind, type: label, fields, values };
  }
  if (!type) {
    // `{}` in a response means "any JSON"; say so rather than pretending it is a string.
    return { ...base, kind: "any", type: d.refName ?? "any" };
  }
  return { ...base, kind: "scalar", type: s.format ? `${type} (${s.format})` : type };
}

// ───────────────────────────── example generation ─────────────────────────────

export interface ExampleOptions {
  /**
   * Optional properties to include beyond the required ones. A prefilled body has to be a useful
   * starting point without being a request nobody meant to send: `SettingsUpdateRequest` declares
   * twenty-five optional fields and sending all of them would rewrite a whole settings section.
   */
  maxOptional?: number;
}

const FORMAT_EXAMPLES: Record<string, string> = {
  "date-time": "2026-01-01T00:00:00.000Z",
  date: "2026-01-01",
  uri: "https://example.com",
  url: "https://example.com",
  email: "name@example.com",
  uuid: "00000000-0000-0000-0000-000000000000",
  binary: "",
};

/** A valid-by-construction example for a schema: required fields, enums, defaults and formats. */
export function exampleFor(
  doc: OpenApiDoc,
  schema: JsonSchema | undefined,
  options: ExampleOptions = {},
  seen: ReadonlySet<string> = new Set(),
  depth = 0,
): unknown {
  const maxOptional = options.maxOptional ?? 8;
  const d = derefSchema(doc, schema, seen);
  if (d.circular || depth >= MAX_DEPTH) return null;
  const s = d.schema;

  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length > 0) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  const type = primaryType(s);
  if (type === "array" || (s.items && !s.properties)) {
    const count = Math.min(Math.max(s.minItems ?? 1, 1), 3);
    const item = exampleFor(doc, s.items, options, d.seen, depth + 1);
    return Array.from({ length: count }, () => item);
  }
  if (type === "object" || s.properties) {
    const required = new Set(s.required ?? []);
    const out: Record<string, unknown> = {};
    let optional = 0;
    for (const [name, sub] of Object.entries(s.properties ?? {})) {
      if (!required.has(name)) {
        if (optional >= maxOptional) continue;
        optional += 1;
      }
      out[name] = exampleFor(doc, sub, options, d.seen, depth + 1);
    }
    return out;
  }
  switch (type) {
    case "string":
      return (s.format && FORMAT_EXAMPLES[s.format]) ?? "string";
    case "integer":
      return clampNumber(0, s);
    case "number":
      return clampNumber(0, s);
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return null;
  }
}

function clampNumber(value: number, s: JsonSchema): number {
  let n = value;
  if (typeof s.minimum === "number" && n < s.minimum) n = s.minimum;
  if (typeof s.maximum === "number" && n > s.maximum) n = s.maximum;
  return n;
}

// ───────────────────────────── indexing ─────────────────────────────

/**
 * Operations that destroy data and therefore need a second click. Every `DELETE` qualifies by
 * method; this list is for the ones that do not announce themselves in the verb.
 */
const EXTRA_DESTRUCTIVE = new Set(["POST /api/v1/retention/purge"]);

export function isDestructive(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return m === "DELETE" || EXTRA_DESTRUCTIVE.has(`${m} ${path}`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readParameters(doc: OpenApiDoc, raw: unknown[]): ApiParameter[] {
  const out: ApiParameter[] = [];
  for (const entry of raw) {
    let p = asRecord(entry);
    if (p && typeof p.$ref === "string") p = asRecord(resolveRef(doc, p.$ref));
    if (!p || typeof p.name !== "string") continue;
    const where = typeof p.in === "string" ? p.in : "query";
    out.push({
      name: p.name,
      in: (where === "path" || where === "header" || where === "cookie" ? where : "query") as
        | "path"
        | "query"
        | "header"
        | "cookie",
      required: p.required === true || where === "path",
      description: typeof p.description === "string" ? p.description : undefined,
      schema: (asRecord(p.schema) as JsonSchema) ?? {},
    });
  }
  return out;
}

function readContents(raw: unknown): MediaEntry[] {
  const content = asRecord(raw);
  if (!content) return [];
  return Object.entries(content).map(([mediaType, value]) => ({
    mediaType,
    schema: asRecord(asRecord(value)?.schema) as JsonSchema | undefined,
  }));
}

function readOperation(
  doc: OpenApiDoc,
  path: string,
  method: HttpMethod,
  raw: Record<string, unknown>,
  shared: unknown[],
): ApiOperation {
  const operationId = typeof raw.operationId === "string" ? raw.operationId : undefined;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  const body = asRecord(raw.requestBody);
  const responses = asRecord(raw.responses) ?? {};
  return {
    id: operationId ?? `${method.toLowerCase()}${path.replace(/[^a-zA-Z0-9]+/g, "-")}`,
    operationId,
    method,
    path,
    tag: tags[0] ?? "Other",
    tags,
    summary: typeof raw.summary === "string" ? raw.summary : `${method} ${path}`,
    description: typeof raw.description === "string" ? raw.description : "",
    deprecated: raw.deprecated === true,
    parameters: readParameters(doc, [...shared, ...(Array.isArray(raw.parameters) ? raw.parameters : [])]),
    requestBody: body
      ? {
          required: body.required === true,
          description: typeof body.description === "string" ? body.description : undefined,
          contents: readContents(body.content),
        }
      : undefined,
    responses: Object.entries(responses)
      .map(([status, value]) => {
        const r = asRecord(value) ?? {};
        return {
          status,
          description: typeof r.description === "string" ? r.description : "",
          contents: readContents(r.content),
        };
      })
      .sort((a, b) => a.status.localeCompare(b.status, "en", { numeric: true })),
    security: Array.isArray(raw.security) ? (raw.security as Array<Record<string, string[]>>) : undefined,
    destructive: isDestructive(method, path),
  };
}

/**
 * Read every operation the document declares, grouped by its first tag.
 *
 * Nothing here is hard-coded to this product's paths: an operation added to the contract tomorrow
 * appears in the index with no change to this file, which is the property the coverage test pins.
 */
export function indexOperations(doc: OpenApiDoc): ApiIndex {
  const operations: ApiOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const pathItem = asRecord(item);
    if (!pathItem) continue;
    const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const raw = asRecord(pathItem[method]);
      if (!raw) continue;
      operations.push(readOperation(doc, path, method.toUpperCase() as HttpMethod, raw, shared));
    }
  }

  const declaredTags = doc.tags ?? [];
  const order = new Map(declaredTags.map((t, i) => [t.name, i] as const));
  const byTag = new Map<string, ApiOperation[]>();
  for (const op of operations) {
    const list = byTag.get(op.tag);
    if (list) list.push(op);
    else byTag.set(op.tag, [op]);
  }
  const groups: TagGroup[] = [...byTag.entries()]
    .map(([name, ops]) => ({
      name,
      description: declaredTags.find((t) => t.name === name)?.description,
      operations: ops,
    }))
    // Tags the document declares keep the author's order; anything else is appended alphabetically.
    .sort((a, b) => {
      const ai = order.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return ai === bi ? a.name.localeCompare(b.name, "en") : ai - bi;
    });

  return {
    title: doc.info?.title ?? "API",
    version: doc.info?.version ?? "",
    operations,
    groups,
    declared: operations.length,
  };
}

/** Substring match, AND across whitespace-separated terms, over method, path, summary and id. */
export function matchesQuery(op: ApiOperation, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${op.method} ${op.path} ${op.summary} ${op.operationId ?? ""} ${op.tag}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function filterGroups(groups: TagGroup[], query: string): TagGroup[] {
  if (query.trim() === "") return groups;
  return groups
    .map((g) => ({ ...g, operations: g.operations.filter((op) => matchesQuery(op, query)) }))
    .filter((g) => g.operations.length > 0);
}

// ───────────────────────────── authentication ─────────────────────────────

export type AuthKind = "public" | "api-key" | "api-key-or-admin" | "admin" | "other";

export interface AuthRequirement {
  kind: AuthKind;
  /** What the caller needs, in plain words. */
  label: string;
  detail: string;
  schemes: string[];
}

/** Read the operation's `security` block and say what a caller actually has to present. */
export function authRequirement(op: ApiOperation): AuthRequirement {
  const schemes = [...new Set((op.security ?? []).flatMap((req) => Object.keys(req)))];
  if (schemes.length === 0)
    return {
      kind: "public",
      label: "No credentials",
      detail:
        "Open to any caller on this deployment, subject to the per-IP rate limit. If this " +
        "deployment sets API_KEYS, a key or the demo session cookie is required instead.",
      schemes,
    };
  const admin = schemes.includes("AdminToken");
  const key = schemes.includes("ApiKey") || schemes.includes("Bearer");
  if (admin && key)
    return {
      kind: "api-key-or-admin",
      label: "An API key or the admin token",
      detail:
        "Send the key as X-API-Key, or either credential as Authorization: Bearer. A signed-in " +
        "operator's admin cookie satisfies it too. The demo session cookie does not.",
      schemes,
    };
  if (admin)
    return {
      kind: "admin",
      label: "The admin token",
      detail:
        "ADMIN_TOKEN, as Authorization: Bearer or as the arag_admin cookie set by signing in at " +
        "/admin/login. Nothing else is accepted.",
      schemes,
    };
  if (key)
    return {
      kind: "api-key",
      label: "An API key or the demo session",
      detail: "Send the key as X-API-Key, or call from a browser holding the demo session cookie.",
      schemes,
    };
  return {
    kind: "other",
    label: schemes.join(" or "),
    detail: "See the security schemes in the OpenAPI document.",
    schemes,
  };
}

// ───────────────────────────── try-it descriptor ─────────────────────────────

export type ControlKind = "text" | "number" | "checkbox" | "select" | "array";
export type ItemControlKind = "text" | "number" | "select";

export interface FormField {
  name: string;
  in: "path" | "query";
  required: boolean;
  description?: string;
  control: ControlKind;
  /** Options for `select`. */
  options: string[];
  /** Control for one row of a repeatable `array` field. */
  itemControl: ItemControlKind;
  itemOptions: string[];
  /** Initial value: the schema's `default` where there is one, otherwise blank (= omitted). */
  initial: string;
  /** Display type for the label's hint. */
  type: string;
}

export type BodyKind = "none" | "json" | "multipart" | "other";

export interface MultipartField {
  name: string;
  required: boolean;
  kind: "file" | "text" | "number" | "checkbox";
  description?: string;
}

export interface BodyDescriptor {
  kind: BodyKind;
  mediaType?: string;
  required: boolean;
  description?: string;
  /** Pretty-printed JSON example, for `kind: "json"`. */
  example?: string;
  /** Scalar and file fields, for `kind: "multipart"`. */
  fields: MultipartField[];
  schema?: JsonSchema;
}

export interface TryItDescriptor {
  operation: ApiOperation;
  pathFields: FormField[];
  queryFields: FormField[];
  body: BodyDescriptor;
  auth: AuthRequirement;
  destructive: boolean;
}

function fieldFor(doc: OpenApiDoc, p: ApiParameter): FormField {
  const d = derefSchema(doc, p.schema);
  const s = d.schema;
  const type = primaryType(s) ?? "string";
  const enumValues = Array.isArray(s.enum) ? s.enum.map(String) : [];
  const itemsDeref = derefSchema(doc, s.items, d.seen).schema;
  const itemEnum = Array.isArray(itemsDeref.enum) ? itemsDeref.enum.map(String) : [];
  const itemType = primaryType(itemsDeref) ?? "string";

  let control: ControlKind = "text";
  if (type === "array") control = "array";
  else if (enumValues.length > 0) control = "select";
  else if (type === "boolean") control = "checkbox";
  else if (type === "integer" || type === "number") control = "number";

  const itemControl: ItemControlKind =
    itemEnum.length > 0 ? "select" : itemType === "integer" || itemType === "number" ? "number" : "text";

  return {
    name: p.name,
    in: p.in === "path" ? "path" : "query",
    required: p.required,
    description: p.description ?? s.description,
    control,
    options: enumValues,
    itemControl,
    itemOptions: itemEnum,
    initial: s.default === undefined ? "" : String(s.default),
    type: type === "array" ? `array of ${itemType}` : (s.format ?? type),
  };
}

function multipartFields(doc: OpenApiDoc, schema: JsonSchema | undefined): MultipartField[] {
  const s = derefSchema(doc, schema).schema;
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([name, sub]) => {
    const inner = derefSchema(doc, sub).schema;
    const type = primaryType(inner) ?? "string";
    const kind: MultipartField["kind"] =
      inner.format === "binary" || inner.format === "byte"
        ? "file"
        : type === "boolean"
          ? "checkbox"
          : type === "integer" || type === "number"
            ? "number"
            : "text";
    return { name, required: required.has(name), kind, description: inner.description };
  });
}

function pickContent(contents: MediaEntry[]): MediaEntry | undefined {
  return (
    contents.find((c) => c.mediaType === "application/json") ??
    contents.find((c) => c.mediaType === "multipart/form-data") ??
    contents[0]
  );
}

/** Everything the try-it panel needs to render a form for one operation and send it. */
export function tryItDescriptor(
  doc: OpenApiDoc,
  op: ApiOperation,
  options: ExampleOptions = {},
): TryItDescriptor {
  const chosen = op.requestBody ? pickContent(op.requestBody.contents) : undefined;
  let body: BodyDescriptor = { kind: "none", required: false, fields: [] };
  if (op.requestBody && chosen) {
    const required = op.requestBody.required;
    if (chosen.mediaType === "application/json") {
      body = {
        kind: "json",
        mediaType: chosen.mediaType,
        required,
        description: op.requestBody.description,
        example: JSON.stringify(exampleFor(doc, chosen.schema, options) ?? {}, null, 2),
        fields: [],
        schema: chosen.schema,
      };
    } else if (chosen.mediaType === "multipart/form-data") {
      body = {
        kind: "multipart",
        mediaType: chosen.mediaType,
        required,
        description: op.requestBody.description,
        fields: multipartFields(doc, chosen.schema),
        schema: chosen.schema,
      };
    } else {
      body = {
        kind: "other",
        mediaType: chosen.mediaType,
        required,
        description: op.requestBody.description,
        fields: [],
        schema: chosen.schema,
      };
    }
  }

  const fields = op.parameters
    .filter((p) => p.in === "path" || p.in === "query")
    .map((p) => fieldFor(doc, p));
  return {
    operation: op,
    pathFields: fields.filter((f) => f.in === "path"),
    queryFields: fields.filter((f) => f.in === "query"),
    body,
    auth: authRequirement(op),
    destructive: op.destructive,
  };
}

// ───────────────────────────── request building ─────────────────────────────

export interface TryItValues {
  path: Record<string, string>;
  /** Blank means "omit"; arrays contribute one entry per non-blank row. */
  query: Record<string, string | string[]>;
  /** Raw JSON text, exactly as the viewer edited it. */
  body: string;
  /** Scalar multipart values. */
  form: Record<string, string>;
  /** Chosen file names per multipart file field — the names only, for the curl. */
  files: Record<string, string>;
  /** True when the viewer has pasted a key. The key itself never enters this module. */
  apiKey: boolean;
}

export interface RequestPart {
  name: string;
  value: string;
  /** Set for file parts; curl renders these as `-F name=@filename`. */
  filename?: string;
}

export interface RequestPlan {
  method: string;
  /** Path with `{placeholders}` substituted. */
  path: string;
  query: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  parts?: RequestPart[];
  usesApiKey: boolean;
  /** Required path parameters still blank; the send button stays disabled while this is non-empty. */
  missing: string[];
}

export function emptyValues(desc: TryItDescriptor): TryItValues {
  const path: Record<string, string> = {};
  for (const f of desc.pathFields) path[f.name] = f.initial;
  const query: Record<string, string | string[]> = {};
  for (const f of desc.queryFields) query[f.name] = f.control === "array" ? [""] : f.initial;
  return {
    path,
    query,
    body: desc.body.kind === "json" ? (desc.body.example ?? "") : "",
    form: {},
    files: {},
    apiKey: false,
  };
}

/** Resolve the form's values into the exact request that will be sent. */
export function buildRequestPlan(desc: TryItDescriptor, values: TryItValues): RequestPlan {
  const missing: string[] = [];
  const path = desc.operation.path.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    const raw = values.path[name] ?? "";
    if (raw === "") {
      missing.push(name);
      return whole;
    }
    return encodeURIComponent(raw);
  });

  const search = new URLSearchParams();
  for (const field of desc.queryFields) {
    const raw = values.query[field.name];
    const items = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const item of items) {
      if (item === "") continue;
      search.append(field.name, item);
    }
  }
  const query = search.toString() ? `?${search.toString()}` : "";

  const headers: Record<string, string> = {};
  let bodyText: string | undefined;
  let parts: RequestPart[] | undefined;
  if (desc.body.kind === "json" && values.body.trim() !== "") {
    headers["Content-Type"] = "application/json";
    bodyText = values.body;
  } else if (desc.body.kind === "multipart") {
    // The Content-Type is deliberately not set: the boundary belongs to the FormData encoder in
    // the browser and to curl's -F, and a hand-written header breaks both.
    parts = [];
    for (const field of desc.body.fields) {
      if (field.kind === "file") {
        const filename = values.files[field.name];
        if (filename) parts.push({ name: field.name, value: "", filename });
      } else {
        const value = values.form[field.name];
        if (value !== undefined && value !== "") parts.push({ name: field.name, value });
      }
    }
  }

  return {
    method: desc.operation.method,
    path,
    query,
    url: `${path}${query}`,
    headers,
    bodyText,
    parts,
    usesApiKey: values.apiKey,
    missing,
  };
}

/** Shell-quote for a single-quoted argument. */
function q(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export interface CurlOptions {
  /** Prefix for the URL, e.g. `https://call-analysis.fly.dev`. Blank renders a relative URL. */
  origin?: string;
  /**
   * Whether the request carries the viewer's pasted key. Passing the key itself is accepted and
   * deliberately ignored: the placeholder is emitted either way, so a copied curl can be pasted
   * into a chat window without leaking anything.
   */
  apiKey?: string | boolean;
  keyVariable?: string;
}

/** The exact request, as a runnable curl, with any pasted key replaced by a shell variable. */
export function buildCurl(plan: RequestPlan, options: CurlOptions = {}): string {
  const variable = options.keyVariable ?? "$CALL_ANALYSIS_API_KEY";
  const url = `${options.origin ?? ""}${plan.url}`;
  const lines = [`curl -X ${plan.method} ${q(url)}`];
  for (const [name, value] of Object.entries(plan.headers)) lines.push(`-H ${q(`${name}: ${value}`)}`);
  const withKey =
    plan.usesApiKey || (typeof options.apiKey === "string" ? options.apiKey !== "" : !!options.apiKey);
  // Double quotes so the shell expands the variable; the key's value is never interpolated here.
  if (withKey) lines.push(`-H "X-API-Key: ${variable}"`);
  for (const part of plan.parts ?? [])
    lines.push(
      part.filename ? `-F ${q(`${part.name}=@${part.filename}`)}` : `-F ${q(`${part.name}=${part.value}`)}`,
    );
  if (plan.bodyText !== undefined) lines.push(`-d ${q(plan.bodyText)}`);
  return lines.join(" \\\n  ");
}

// ───────────────────────────── response reading ─────────────────────────────

export type BodyRender = "json" | "problem" | "text" | "binary";

/** How a response body should be shown, decided from its content type alone. */
export function responseRender(contentType: string): BodyRender {
  const ct = contentType.toLowerCase();
  if (ct.includes("problem+json")) return "problem";
  // NDJSON and JSON-seq are streams of documents, not one document: parsing the whole body fails.
  if (ct.includes("ndjson") || ct.includes("json-seq")) return "text";
  if (ct.includes("json")) return "json";
  if (ct.startsWith("text/") || ct.includes("event-stream") || ct.includes("xml") || ct.includes("csv"))
    return "text";
  return "binary";
}

export interface ProblemDocument {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Array<{ path?: string; message?: string }>;
}

/** Read an RFC 9457 body into its named parts, keeping anything unexpected as `extra`. */
export function readProblem(value: unknown): { problem: ProblemDocument; extra: Record<string, unknown> } {
  const record = asRecord(value) ?? {};
  const { type, title, status, detail, instance, requestId, errors, ...extra } = record;
  return {
    problem: {
      type: typeof type === "string" ? type : undefined,
      title: typeof title === "string" ? title : undefined,
      status: typeof status === "number" ? status : undefined,
      detail: typeof detail === "string" ? detail : undefined,
      instance: typeof instance === "string" ? instance : undefined,
      requestId: typeof requestId === "string" ? requestId : undefined,
      errors: Array.isArray(errors) ? (errors as Array<{ path?: string; message?: string }>) : undefined,
    },
    extra,
  };
}

/** Response headers worth putting on screen; everything else is noise in an explorer. */
export const NOTABLE_HEADERS = ["content-type", "x-request-id", "location", "retry-after"] as const;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Method badge colour. Three tones plus neutral, not one per verb: the point is "does this read,
 * write or destroy", and a seven-colour legend answers a question nobody asked.
 */
export function methodChipClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return "arag-chip neutral";
    case "POST":
      return "arag-chip info";
    case "PUT":
    case "PATCH":
      return "arag-chip warn";
    case "DELETE":
      return "arag-chip danger";
    default:
      return "arag-chip outline";
  }
}

export function statusTone(status: number): "ok" | "warn" | "error" | "muted" {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "muted";
  if (status >= 400 && status < 500) return "warn";
  return "error";
}
