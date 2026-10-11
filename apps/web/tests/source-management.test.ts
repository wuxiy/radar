import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceIndustry, sourceManagementReturn } from "@aihot/contracts/source-management";
import { industryPath } from "@aihot/industry/paths";

test("management defaults to medical and accepts only one explicit industry", () => {
  assert.equal(sourceIndustry(new URLSearchParams()), "medical");
  assert.equal(sourceIndustry(new URLSearchParams("industry=ai")), "ai");
  for (const query of ["industry=other", "industry=", "industry=medical&industry=ai"]) assert.equal(sourceIndustry(new URLSearchParams(query)), null);
});

test("login return allows only source-management paths in the authenticated industry", () => {
  assert.equal(sourceManagementReturn("/manage/sources", "medical"), "/manage/sources?industry=medical");
  assert.equal(sourceManagementReturn("/manage/sources/new?industry=ai", "ai"), "/manage/sources/new?industry=ai");
  assert.equal(sourceManagementReturn("/manage/sources/x-yetone?industry=ai&q=blog", "ai"), "/manage/sources/x-yetone?industry=ai&q=blog");
  for (const path of ["//evil.test/manage/sources", "https://evil.test/manage/sources", "/manage/models", "/manage/sources/../sources", "/manage/sources/%2e%2e/other", "/manage/sources#secret", "/manage/sources?industry=ai&industry=medical", "/manage\\sources", "/manage/sources\n"]) {
    assert.equal(sourceManagementReturn(path, "medical"), null, path);
  }
  assert.equal(sourceManagementReturn("/manage/sources?industry=ai", "medical"), null);
  assert.equal(sourceManagementReturn("/manage/sources", "ai"), null);
  assert.equal(industryPath("/manage/sources?industry=ai"), "/manage/sources?industry=ai");
});
