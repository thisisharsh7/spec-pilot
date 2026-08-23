import { DataSourceError, resolveDataSource } from "@/lib/data/repository";
import { taskSpecSchema } from "@/lib/domain/spec";
import { buildRecommendation } from "@/lib/engine/recommend";

/*
  The specification travels in a request body, never a URL, so the user's task
  description and sample data stay out of history, referrers and access logs.

  The engine runs here rather than in the browser so the model catalog is not
  shipped to the client and the same code path works once Supabase replaces
  fixtures.
*/

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = taskSpecSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "The specification is incomplete or invalid.",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const { mode, repository } = await resolveDataSource();
    const models = await repository.listModels();

    return Response.json({
      dataMode: mode,
      recommendation: buildRecommendation(parsed.data, models),
    });
  } catch (error) {
    if (error instanceof DataSourceError) {
      // Names only. Never the values.
      return Response.json(
        { error: error.message, missingEnvVars: error.missingEnvVars },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "The model catalog could not be loaded." },
      { status: 500 },
    );
  }
}
