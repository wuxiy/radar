import { setVisibility } from "@aihot/backend/admin/content";
// Explicitly invoked by scripts/verify-radar.ts, never by the ordinary single-industry test suite.
import assert from "node:assert/strict";
import { PROFILE } from "@aihot/industry/profile";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { paidRequest, BudgetExceededError } from "@aihot/backend/providers/receipts";

if (!PROFILE.basePath || !/_(test|ci)$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Radar fixtures require an isolated *_test or *_ci database and an explicit industry condition");
const source = `radar-${PROFILE.id}-fixture`;
const ids = ["radar_same_id", `radar_${PROFILE.id}_only`, "radar_unreleased", "radar_withdrawn", "radar_summary_only"];
const date = beijingDate(Date.now());
async function visibility(id: string, value: "public" | "withdrawn" | "summary-only") {
  const [row] = await sql`SELECT version FROM editorial_overrides WHERE article_id = ${id}`;
  await setVisibility(id, { visibility: value, reason: "本机隔离验收", version: row?.version ?? 0 }, "radar-acceptance");
}
try {
  if (process.argv[2] === "seed") {
    await sql`INSERT INTO sources (id, name, kind, tier, site_fulltext, syndicate_fulltext, enabled)
      VALUES (${source}, '验收样本来源', 'external', 'T1', false, false, false) ON CONFLICT (id) DO NOTHING`;
    for (const id of ids) {
      const title = `${PROFILE.id === "medical" ? "医疗高质量数据集" : "AI 模型发布"}验收样本 ${id}`;
      await upsertMaterial({ id, sourceId: source, url: `https://example.org/${PROFILE.id}/${id}`, title, bodyText: `PRIVATE-FIXTURE-BODY-${PROFILE.id}`, bodyHtml: `<p>PRIVATE-FIXTURE-BODY-${PROFILE.id}</p>`, bodyStatus: "ok", publishedAt: new Date(), via: "import" });
      await sql`DELETE FROM analyses WHERE article_id = ${id}`;
      await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected, tags)
        VALUES (${id}, 1, 'rule', 'pass', ${CATEGORIES[0].key}, ${title}, ${`SUMMARY-${PROFILE.id}-${id}`}, '明确标记的本机隔离验收样本', 92, true, ${PROFILE.id === "medical" ? ["高质量数据集", "影像系统"] : ["模型发布"]})`;
      await sql`DELETE FROM editorial_overrides WHERE article_id = ${id}`;
      await publishArticle(id, { releasedAt: new Date(id === "radar_unreleased" ? Date.now() + 86400_000 : Date.now() - 60_000) });
    }
    await visibility("radar_withdrawn", "withdrawn");
    await visibility("radar_summary_only", "summary-only");
    const content = { sections: [{ label: "验收样本", items: [{ itemId: "radar_same_id", title: `REPORT-${PROFILE.id}`, summary: `REPORT-SUMMARY-${PROFILE.id}`, sourceUrl: `https://example.org/${PROFILE.id}/report`, sourceName: "验收样本来源" }] }], flashes: [] };
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
      VALUES ('daily', ${date}, now() - interval '1 day', now(), ${sql.json(content)}, now(), 'manual') ON CONFLICT (kind, key) DO UPDATE SET content = EXCLUDED.content`;
    console.log(JSON.stringify({ industry: PROFILE.id, date }));
  } else if (process.argv[2] === "withdraw") {
    assert.equal(PROFILE.id, "medical");
    await visibility("radar_same_id", "withdrawn");
  } else if (process.argv[2] === "restore") {
    await visibility("radar_same_id", "public");
  } else if (process.argv[2] === "cleanup") {
    await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${date} AND origin = 'manual'`;
    await sql`DELETE FROM articles WHERE source_id = ${source}`;
    await sql`DELETE FROM sources WHERE id = ${source}`;
    await sql`DELETE FROM receipts WHERE service = 'radar-acceptance-local-mock'`;
    await sql`DELETE FROM budgets WHERE service = 'radar-acceptance-local-mock'`;
    const boss = await getBoss();
    await boss.deleteQueue("radar.acceptance");
  } else if (process.argv[2] === "isolation") {
    const service = "radar-acceptance-local-mock";
    await sql`DELETE FROM receipts WHERE service = ${service}`;
    await sql`INSERT INTO budgets (service, per_minute, per_hour, per_day) VALUES (${service}, ${PROFILE.id === "ai" ? 0 : 100}, 100, 100)
      ON CONFLICT (service) DO UPDATE SET per_minute = EXCLUDED.per_minute`;
    const request = { service, purpose: "isolated-local-response", identity: { sameLogicalInput: true } };
    let hits = 0;
    const mock = async () => { hits++; return { response: { industry: PROFILE.id } }; };
    if (PROFILE.id === "ai") { await assert.rejects(paidRequest(request, mock), BudgetExceededError); assert.equal(hits, 0); }
    else {
      assert.deepEqual((await paidRequest(request, mock)).response, { industry: "medical" });
      assert.equal((await paidRequest(request, mock)).reused, true); assert.equal(hits, 1);
    }
    const boss = await getBoss();
    await boss.createQueue("radar.acceptance");
    const jobId = await boss.send("radar.acceptance", { industry: PROFILE.id, articleId: "radar_same_id" });
    assert.deepEqual((await boss.getJobById("radar.acceptance", jobId!))!.data, { industry: PROFILE.id, articleId: "radar_same_id" });
    console.log(JSON.stringify({ industry: PROFILE.id, jobId, blocked: PROFILE.id === "ai", mockHits: hits }));
  } else throw new Error("Unknown fixture action");
} finally { await stopBoss(); await closeDb(); }
