import { DEFAULT_CONFIG } from "../../secrets";

export async function GET() {
  return Response.json(DEFAULT_CONFIG);
}
