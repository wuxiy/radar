import { SITE } from "@aihot/site";
import type { Route } from "./+types/sources";
import type { AdminSources } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import Sources from "../../features/admin/source-list";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return adminGet<AdminSources>(request, `/api/admin/sources${url.search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `信源 · ${SITE.name} 后台` }];

export default function SourcesRoute({ loaderData }: Route.ComponentProps) {
  return <Sources loaderData={loaderData} />;
}
