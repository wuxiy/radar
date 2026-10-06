import { useState } from "react";
import type { AdminDefaultModel, AdminModelConfigurationInput } from "@aihot/contracts/admin";
import { useAdminAction } from "./action";
import { Badge, Button, Card, Field, Input, ReasonDialog, Textarea } from "./ui";

type Draft = Omit<AdminModelConfigurationInput, "reason">;
const draftOf = (config: AdminDefaultModel): Draft => ({
  baseUrl: config.baseUrl, model: config.model, apiKey: "", connectIp: config.connectIp,
  extraJson: config.extraJson, jsonMode: config.jsonMode, vision: config.vision,
  perMinute: config.budget?.per_minute ?? 0, perHour: config.budget?.per_hour ?? 0, perDay: config.budget?.per_day ?? 0,
});

export function ModelConfiguration({ configuration: c }: { configuration: AdminDefaultModel }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(c));
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const close = () => { setOpen(false); setDraft(d => ({ ...d, apiKey: "" })); };

  return <>
    <Card title="默认模型配置" right={<Button size="sm" onClick={() => { setDraft(draftOf(c)); setOpen(true); }}>配置模型</Button>}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all font-mono text-[13px]">{c.model || "尚未配置模型"}</span>
        <Badge tone={c.callsEnabled ? "accent" : "muted"}>{c.callsEnabled ? "模型调用已开启" : "模型调用未开启"}</Badge>
        <Badge tone="muted">{c.keyConfigured ? "密钥已配置" : "缺少密钥"}</Badge>
      </div>
      <p className="mt-2 break-all text-[13px] text-ink-3">{c.baseUrl || "尚未配置 API 地址"}</p>
      <p className="mt-2 text-[13px] text-ink-3">最近 24 小时已调用 {c.budget?.used_day ?? 0} / {c.budget?.per_day ?? 0} 次。使用默认模型的步骤共用此限额，失败和重试也计入。</p>
      <p className="mt-1 text-[12px] text-ink-4">仅作用于当前行业的 default 模型。保存后 API 和处理任务自动读取；各能力单独选择的预设模型沿用自己的配置。</p>
    </Card>
    <ReasonDialog open={open} onClose={close} title="配置默认模型" description="密钥保存在后端，留空保留现有密钥。修改只影响之后的新请求。" confirmLabel="保存配置" busy={pending === "configure-model"}
      onSubmit={async reason => (await run("PUT", "/api/admin/models/configuration", { ...draft, reason }, { label: "configure-model", success: "模型配置已保存，下一次请求生效" })) !== null}>
      <Field label="API 地址" hint="OpenAI 兼容接口的基础地址，通常以 /v1 结尾。">
        <Input required aria-label="API 地址" type="url" value={draft.baseUrl} onChange={e => change("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
      </Field>
      <Field label="模型名称" hint="填写网关实际支持的完整名称，例如 deepseek/deepseek-flash。">
        <Input required aria-label="模型名称" value={draft.model} onChange={e => change("model", e.target.value)} placeholder="deepseek/deepseek-flash" />
      </Field>
      <Field label="API 密钥">
        <Input aria-label="API 密钥" type="password" autoComplete="new-password" value={draft.apiKey} onChange={e => change("apiKey", e.target.value)} placeholder={c.keyConfigured ? "已配置，留空保留" : "首次配置请填写密钥"} required={!c.keyConfigured} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        {([["perMinute", "每分钟"], ["perHour", "每小时"], ["perDay", "24 小时"]] as const).map(([key, label]) => <Field key={key} label={`${label}限额`}>
          <Input required aria-label={`${label}限额`} type="number" min={0} max={1_000_000} step={1} value={Number.isNaN(draft[key]) ? "" : draft[key]} onChange={e => change(key, e.target.value === "" ? NaN : Number(e.target.value))} />
        </Field>)}
      </div>
      <p className="text-[12px] text-ink-4">按滚动时间窗口计数，任一限额为 0 就停止调用。配置不会开启服务器上关闭的模型调用开关。</p>
      <details>
        <summary className="cursor-pointer text-[13px] text-ink-3">高级设置</summary>
        <div className="mt-3 space-y-3">
          <Field label="连接 IP（可选）" hint="仅网关需要时填写；保留 API 地址的 Host。更换 API 地址时请核对此项。">
            <Input value={draft.connectIp} onChange={e => change("connectIp", e.target.value)} placeholder="留空使用正常 DNS" />
          </Field>
          <Field label="额外请求参数（可选）" hint={'JSON 对象，例如 {"thinking":{"type":"disabled"}}。'}>
            <Textarea value={draft.extraJson} onChange={e => change("extraJson", e.target.value)} rows={3} />
          </Field>
          <div className="flex flex-wrap gap-4 text-[13px]">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.jsonMode} onChange={e => change("jsonMode", e.target.checked)} />JSON 模式</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.vision} onChange={e => change("vision", e.target.checked)} />支持图片输入</label>
          </div>
        </div>
      </details>
    </ReasonDialog>
  </>;
}
