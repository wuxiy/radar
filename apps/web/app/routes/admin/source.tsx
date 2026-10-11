import { SITE } from "@aihot/site";
import type { Route } from "./+types/source";
import type { AdminSourceDetail } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import SourceDetail from "../../features/admin/source-detail";

export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminSourceDetail>(request, `/api/admin/sources/${encodeURIComponent(params.id)}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.source.name ?? "信源"} · ${SITE.name} 后台` }];

export default function SourceRoute({ loaderData }: Route.ComponentProps) {
  return <SourceDetail loaderData={loaderData} />;
}
