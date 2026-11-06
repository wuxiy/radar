import { SITE } from "@aihot/site";
import type { Route } from "./+types/source-new";
import type { AdminSources } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import NewSource from "../../features/admin/source-new";

export async function loader({ request }: Route.LoaderArgs) { return adminGet<AdminSources>(request, "/api/admin/sources"); }
export default function NewSourceRoute({ loaderData }: Route.ComponentProps) { return <NewSource loaderData={loaderData} />; }

export const meta: Route.MetaFunction = () => [{ title: `新建信源 · ${SITE.name} 后台` }];
