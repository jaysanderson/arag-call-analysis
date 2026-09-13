"use client";

import { IconKey, IconLink } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
import { SchemaTree } from "./SchemaTree";
import {
  type ApiOperation,
  type AuthRequirement,
  describeSchema,
  methodChipClass,
  type OpenApiDoc,
} from "./spec";

/**
 * The reference half of the detail pane: what the operation is, what it needs, what it takes and
 * what it gives back. The try-it form sits between the summary and this, because the question a
 * reader arrives with is "what does this do when I run it".
 */

function AuthLine({ auth }: { auth: AuthRequirement }) {
  const tone =
    auth.kind === "public" ? "arag-chip ok" : auth.kind === "admin" ? "arag-chip danger" : "arag-chip warn";
  return (
    <div className="ca-api-auth">
      <IconKey size={15} />
      <div>
        <span className={tone}>{auth.label}</span>
        <p className="arag-help" style={{ marginTop: 4 }}>
          {auth.detail}
        </p>
      </div>
    </div>
  );
}

function ParameterTable({ op }: { op: ApiOperation }) {
  return (
    <div className="arag-datatable">
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">In</th>
              <th scope="col">Type</th>
              <th scope="col">Required</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {op.parameters.map((p) => {
              const type = Array.isArray(p.schema.type) ? p.schema.type.join(" | ") : p.schema.type;
              const values = Array.isArray(p.schema.enum) ? p.schema.enum.map(String) : [];
              const items = p.schema.items;
              const itemType = Array.isArray(items?.type) ? items?.type.join(" | ") : items?.type;
              return (
                <tr key={`${p.in}-${p.name}`}>
                  <th scope="row">
                    <code>{p.name}</code>
                  </th>
                  <td>{p.in}</td>
                  <td>
                    <code>{type === "array" ? `array of ${itemType ?? "string"}` : (type ?? "string")}</code>
                    {p.schema.default !== undefined && (
                      <span className="arag-help"> default {JSON.stringify(p.schema.default)}</span>
                    )}
                  </td>
                  <td>{p.required ? "yes" : "no"}</td>
                  <td>
                    {p.description && <Markdown text={p.description} />}
                    {values.length > 0 && (
                      <div className="arag-chips" style={{ marginTop: 4 }}>
                        {values.map((v) => (
                          <code key={v} className="ca-api-enum">
                            {v}
                          </code>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OperationHeader({
  op,
  auth,
  onCopyLink,
}: {
  op: ApiOperation;
  auth: AuthRequirement;
  onCopyLink: () => void;
}) {
  return (
    <section className="arag-card" aria-labelledby="op-heading">
      <div className="head">
        <h2 id="op-heading" data-testid="operation-title">
          {op.summary}
        </h2>
        <button type="button" className="arag-btn ghost sm" onClick={onCopyLink}>
          <IconLink size={14} /> Copy link
        </button>
      </div>
      <div className="body">
        <div className="ca-api-signature" data-testid="operation-signature">
          <span className={methodChipClass(op.method)}>{op.method}</span>
          <code>{op.path}</code>
          {op.operationId && <span className="arag-chip outline">{op.operationId}</span>}
          {op.deprecated && <span className="arag-chip danger">deprecated</span>}
        </div>
        {op.description && <Markdown text={op.description} className="ca-api-prose" />}
        <AuthLine auth={auth} />
      </div>
    </section>
  );
}

export function OperationReference({ doc, op }: { doc: OpenApiDoc; op: ApiOperation }) {
  const bodyContents = op.requestBody?.contents ?? [];
  return (
    <>
      <section className="arag-card" aria-labelledby="params-heading">
        <div className="head">
          <h2 id="params-heading">Parameters</h2>
          <span className="arag-help">{op.parameters.length} declared</span>
        </div>
        <div className="body">
          {op.parameters.length === 0 ? (
            <p className="arag-help">This operation takes no path, query or header parameters.</p>
          ) : (
            <ParameterTable op={op} />
          )}
        </div>
      </section>

      {bodyContents.length > 0 && (
        <section className="arag-card" aria-labelledby="reqbody-heading">
          <div className="head">
            <h2 id="reqbody-heading">Request body</h2>
            <span className="arag-help">{op.requestBody?.required ? "required" : "optional"}</span>
          </div>
          <div className="body">
            {op.requestBody?.description && (
              <Markdown text={op.requestBody.description} className="ca-api-prose" />
            )}
            {bodyContents.map((c) => (
              <div key={c.mediaType} style={{ marginTop: 8 }}>
                <div className="arag-label">{c.mediaType}</div>
                <SchemaTree node={describeSchema(doc, c.schema)} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="arag-card" aria-labelledby="responses-heading">
        <div className="head">
          <h2 id="responses-heading">Responses</h2>
          <span className="arag-help">{op.responses.length} declared</span>
        </div>
        <div className="body">
          {op.responses.map((r) => {
            const success = r.status.startsWith("2");
            return (
              <details
                key={r.status}
                className="ca-api-response"
                open={success}
                data-testid={`response-${r.status}`}
              >
                <summary>
                  <span
                    className={
                      success
                        ? "arag-chip ok"
                        : r.status.startsWith("4")
                          ? "arag-chip warn"
                          : "arag-chip danger"
                    }
                  >
                    {r.status}
                  </span>
                  <span>{r.description}</span>
                  {r.contents.length > 0 && (
                    <code className="ca-api-media">{r.contents.map((c) => c.mediaType).join(", ")}</code>
                  )}
                </summary>
                {r.contents.length === 0 ? (
                  <p className="arag-help">No body.</p>
                ) : (
                  r.contents.map((c) => (
                    <div key={c.mediaType} style={{ marginTop: 6 }}>
                      <SchemaTree node={describeSchema(doc, c.schema)} />
                    </div>
                  ))
                )}
              </details>
            );
          })}
        </div>
      </section>
    </>
  );
}
