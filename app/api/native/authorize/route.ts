import { authorizeNativeCheck } from "../../../lib/native-authorize.server";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  return authorizeNativeCheck(request);
}
