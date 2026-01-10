import { apiRoutes, type RunSheetRequest, type RunSheetResponse } from "@esproc/web-shared";

export async function runSheetRemote(baseUrl: string, req: RunSheetRequest, fetchImpl: typeof fetch = fetch): Promise<RunSheetResponse> {
  const res = await fetchImpl(`${baseUrl}${apiRoutes.runSheet}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`runSheet failed with status ${res.status}`);
  }
  return (await res.json()) as RunSheetResponse;
}
