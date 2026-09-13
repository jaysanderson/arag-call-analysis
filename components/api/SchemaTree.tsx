"use client";

import { Markdown } from "@/components/Markdown";
import type { SchemaField, SchemaNode } from "./spec";

/**
 * A schema rendered as the thing a reader actually wants: a field tree with names, types, whether
 * each field is required and what it is for — not the JSON Schema source. Objects and arrays are
 * `<details>`, so a deep response (Dashboard carries four nested collections) opens one branch at
 * a time instead of filling the screen.
 */

function Badges({ node, required }: { node: SchemaNode; required: boolean }) {
  return (
    <>
      <span className="arag-chip outline">{node.type}</span>
      {required && <span className="arag-chip warn">required</span>}
      {node.nullable && <span className="arag-chip neutral">nullable</span>}
      {node.default !== undefined && (
        <span className="arag-chip neutral">default {JSON.stringify(node.default)}</span>
      )}
    </>
  );
}

function Details({ node }: { node: SchemaNode }) {
  return (
    <>
      {node.description && <Markdown text={node.description} className="ca-api-fielddesc" />}
      {node.enumValues && node.enumValues.length > 0 && (
        <div className="arag-chips" style={{ marginTop: 4 }}>
          {node.enumValues.map((v) => (
            <code key={v} className="ca-api-enum">
              {v}
            </code>
          ))}
        </div>
      )}
      {node.constraints.length > 0 && <p className="arag-help">{node.constraints.join(" · ")}</p>}
    </>
  );
}

function childrenOf(node: SchemaNode): SchemaField[] {
  if (node.kind === "array" && node.items) return [{ name: "items", required: false, node: node.items }];
  if (node.values) return [...node.fields, { name: "(any key)", required: false, node: node.values }];
  return node.fields;
}

function FieldRow({ field, depth }: { field: SchemaField; depth: number }) {
  const kids = childrenOf(field.node);
  const head = (
    <span className="ca-api-fieldhead">
      <code className="ca-api-fieldname">{field.name}</code>
      <Badges node={field.node} required={field.required} />
    </span>
  );
  if (kids.length === 0) {
    return (
      <li className="ca-api-field">
        {head}
        <Details node={field.node} />
      </li>
    );
  }
  return (
    <li className="ca-api-field">
      {/* Only the first level is open: a fully expanded CallDetail is three screens of tree. */}
      <details open={depth < 1}>
        <summary>{head}</summary>
        <Details node={field.node} />
        <ul className="ca-api-fieldlist">
          {kids.map((k) => (
            <FieldRow key={k.name} field={k} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function SchemaTree({ node, label }: { node: SchemaNode; label?: string }) {
  const kids = childrenOf(node);
  if (kids.length === 0) {
    return (
      <div className="ca-api-field">
        <span className="ca-api-fieldhead">
          {label && <code className="ca-api-fieldname">{label}</code>}
          <Badges node={node} required={false} />
        </span>
        <Details node={node} />
      </div>
    );
  }
  return (
    <div>
      <div className="ca-api-fieldhead" style={{ marginBottom: 6 }}>
        <span className="arag-chip outline">{node.type}</span>
        {node.kind === "object" && (
          <span className="arag-help">
            {node.fields.length} field{node.fields.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {node.description && <Markdown text={node.description} className="ca-api-fielddesc" />}
      <ul className="ca-api-fieldlist root">
        {kids.map((k) => (
          <FieldRow key={k.name} field={k} depth={0} />
        ))}
      </ul>
    </div>
  );
}
