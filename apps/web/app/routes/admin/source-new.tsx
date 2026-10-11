import { SITE } from "@aihot/site";
import type { Route } from "./+types/source-new";
export { default } from "../../features/admin/source-new";

export const meta: Route.MetaFunction = () => [{ title: `新建信源 · ${SITE.name} 后台` }];
