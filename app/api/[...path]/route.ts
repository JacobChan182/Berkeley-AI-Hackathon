/**
 * Runtime proxy to the FastAPI backend.
 * Reads PYTHON_BACKEND_URL at request time (Railway / production).
 */
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const backendBase = () => process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";

async function proxy(request: NextRequest, path: string[]) {
  const target = `${backendBase()}/api/${path.join("/")}${request.nextUrl.search}`;

  const method = request.method;
  const isRead = method === "GET" || method === "HEAD";

  const upstream = await fetch(
    target,
    isRead
      ? { method, headers: { Accept: request.headers.get("accept") ?? "application/json" } }
      : {
          method,
          headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
          body: await request.text(),
        }
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  try {
    const { path } = await context.params;
    if (!path?.length) {
      return Response.json({ error: "missing path segments" }, { status: 400 });
    }
    return await proxy(request, path);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
