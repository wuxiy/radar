// Reuse the existing admin's paper/ink theme, source table, editor and audited commands.
// One browser page selects an industry's HTTP API; it holds no database connection or shared session.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet, Link, useLoaderData, useLocation, useNavigation, useRouteError, useRevalidator, useBlocker, useBeforeUnload, isRouteErrorResponse, data, type LoaderFunctionArgs } from "react-router";
import type { AdminMe } from "@aihot/contracts/admin";
import { sourceIndustry, SOURCE_INDUSTRY_LABEL, type SourceIndustry } from "@aihot/contracts/source-management";
import { SourceManagementContext } from "../app/features/admin/source-context";
import { Button } from "../app/features/admin/ui";
import { Toaster } from "../app/features/admin/toast";
import "./manage.css";

function industryOf(request: Request): SourceIndustry {
  const industry = sourceIndustry(new URL(request.url).searchParams);
  if (!industry) throw data({ message: "行业参数无效，请选择医疗或 AI。" }, { status: 400 });
  return industry;
}

async function read(request: Request, path: string) {
  const res = await fetch(`/${industryOf(request)}${path}`, {
    credentials: "same-origin", headers: { accept: "application/json" },
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    throw data({ message: problem.detail ?? `请求失败（${res.status}）` }, { status: res.status });
  }
  return res.json();
}

async function sessionLoader({ request }: LoaderFunctionArgs) {
  const industry = industryOf(request);
  try {
    const me = await read(request, "/api/admin/me") as AdminMe;
    return { industry, me, error: null };
  } catch (error) {
    if (request.signal.aborted) throw error;
    const status = (error as { init?: { status?: number } }).init?.status;
    return { industry, me: null, error: status === 401 ? null : "当前行业服务暂不可用，请稍后重试或切换行业。" };
  }
}

function Header() {
  const location = useLocation();
  const navigation = useNavigation();
  const industry = sourceIndustry(new URLSearchParams(location.search));
  return <header className="border-b border-line bg-surface">
    <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <a href="/medical" className="text-[18px] font-semibold tracking-tight text-ink">Radar</a>
      <nav aria-label="信源行业" className="flex items-center gap-1 rounded-control bg-bg-sunk p-1">
        {(["medical", "ai"] as const).map(id => <Link key={id} to={`/sources?industry=${id}`} aria-current={industry === id ? "page" : undefined}
          className={`rounded-control px-5 py-2 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${industry === id ? "bg-ink text-bg" : "text-ink-3 hover:text-ink"}`}>
          {SOURCE_INDUSTRY_LABEL[id]}
        </Link>)}
      </nav>
      <a href={`/${industry ?? "medical"}/admin`} className="text-[13px] text-ink-3 hover:text-accent">行业后台</a>
    </div>
    {navigation.state !== "idle" && <p role="status" className="px-4 pb-2 text-center text-[12px] text-ink-3">正在加载…</p>}
  </header>;
}

function LeaveDialog({ pending, onStay, onLeave }: { pending: boolean; onStay: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby="leave-title" onCancel={e => { e.preventDefault(); onStay(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-sheet bg-surface p-6 text-ink backdrop:bg-ink/30">
    <h2 id="leave-title" className="text-[17px] font-semibold">{pending ? "操作尚未完成" : "有未保存的信源修改"}</h2>
    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{pending ? "请等待当前操作完成，再切换行业或离开页面。" : "离开后会丢弃当前表单，不会保存到另一个行业。"}</p>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button onClick={onStay} autoFocus>{pending ? "留在当前页面" : "继续编辑"}</Button>
      {!pending && <Button tone="primary" onClick={onLeave}>放弃修改并离开</Button>}
    </div>
  </dialog>;
}

function ManagementLayout() {
  const { industry, me, error } = useLoaderData<typeof sessionLoader>();
  const location = useLocation();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const dirty = useRef(false), pending = useRef(false);
  const setDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const setPending = useCallback((value: boolean) => { pending.current = value; }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty.current || pending.current) &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useBeforeUnload(useCallback((e: BeforeUnloadEvent) => {
    if (dirty.current || pending.current) { e.preventDefault(); e.returnValue = ""; }
  }, []));
  const context = useMemo(() => me ? { industry, me, setDirty, setPending } : null, [industry, me, setDirty, setPending]);
  const login = `/${industry}/api/auth/login?${new URLSearchParams({ return: "/manage" + location.pathname + location.search })}`;
  useEffect(() => { document.title = `${SOURCE_INDUSTRY_LABEL[industry]}信源管理 · Radar`; }, [industry]);
  return <div className="min-h-dvh bg-bg">
    <Header />
    <div className="mx-auto max-w-[1320px] px-4 pt-4 text-[12.5px] text-ink-3 sm:px-6 lg:px-8" role="status">
      当前行业：<span className="font-medium text-ink">{SOURCE_INDUSTRY_LABEL[industry]}</span>{me && <> · {me.name}</>}
    </div>
    <main>
      {context ? <div inert={navigation.state !== "idle"} aria-busy={navigation.state !== "idle"}>
        <SourceManagementContext.Provider value={context}><Outlet key={`${industry}:${location.pathname}`} /></SourceManagementContext.Provider>
      </div>
        : <section className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-[22px] font-semibold text-ink">{SOURCE_INDUSTRY_LABEL[industry]}信源管理</h1>
          <p className="mt-2 text-[13.5px] text-ink-3">{error ?? "请登录当前行业的管理员账号。已有统一身份登录状态可继续使用。"}</p>
          <div className="mt-5">{error ? <Button onClick={() => revalidator.revalidate()}>重试</Button>
            : <a className="inline-flex rounded-control bg-ink px-4 py-2 text-[13.5px] text-bg" href={login}>登录{SOURCE_INDUSTRY_LABEL[industry]}频道</a>}</div>
        </section>}
    </main>
    {blocker.state === "blocked" && <LeaveDialog pending={pending.current} onStay={() => blocker.reset()}
      onLeave={() => { setDirty(false); blocker.proceed(); }} />}
    <Toaster />
  </div>;
}

function SourceError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const message = isRouteErrorResponse(error) ? error.status === 404 ? "信源不存在或已删除。" : error.data?.message : "加载失败，请检查连接后重试。";
  return <section className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8">
    <h1 className="text-[22px] font-semibold text-ink">无法加载信源</h1>
    <p role="alert" className="my-3 text-[13.5px] text-ink-3">{message}</p>
    <Button onClick={() => revalidator.revalidate()}>重试</Button>
  </section>;
}

const router = createBrowserRouter([{
  path: "/", loader: sessionLoader, Component: ManagementLayout,
  ErrorBoundary: () => <><Header /><SourceError /></>,
  children: [
    { path: "sources", loader: ({ request }) => {
      const query = new URL(request.url).searchParams; query.delete("industry");
      return read(request, `/api/admin/sources?${query}`);
    }, lazy: async () => {
      const { default: Sources } = await import("../app/features/admin/source-list");
      return { Component: () => <Sources loaderData={useLoaderData()} /> };
    }, ErrorBoundary: SourceError },
    { path: "sources/new", lazy: async () => ({ Component: (await import("../app/features/admin/source-new")).default }), ErrorBoundary: SourceError },
    { path: "sources/:id", loader: ({ request, params }) => read(request, `/api/admin/sources/${encodeURIComponent(params.id!)}`),
      lazy: async () => {
        const { default: Source } = await import("../app/features/admin/source-detail");
        return { Component: () => <Source loaderData={useLoaderData()} /> };
      }, ErrorBoundary: SourceError },
  ],
}], { basename: "/manage" });

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
