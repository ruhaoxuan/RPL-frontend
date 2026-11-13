import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
await mkdir("test-results", { recursive: true });
const data = JSON.parse(
  await readFile("public/generated/catalog.json", "utf8"),
);
try {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "RPL Atlas" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(20);
  await expect(
    page.getByRole("heading", { name: "模式来源分布 Source composition" }),
  ).toBeVisible();
  const chart = page.getByRole("img", { name: /模式来源占比/ });
  await expect(chart).toHaveAttribute("aria-label", /Clippy 18 条，占 34.0%/);
  await page
    .getByRole("button", { name: "按 CodeQL 筛选模式", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(3);
  await expect(chart).toHaveAttribute("aria-label", /合计 53 条/);
  await page
    .getByRole("button", { name: "按 CodeQL 筛选模式", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(20);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: "test-results/home-preview.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(13);
  await page.getByRole("button", { name: /CodeQL 3/ }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await page.getByRole("button", { name: /全部模式 53/ }).click();
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByLabel("搜索模式").fill("CVE");
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/q=CVE&page=2/);
  await expect(page.locator("article")).toHaveCount(10);
  expect(
    await page
      .locator("#results")
      .evaluate((el) => Math.abs(el.getBoundingClientRect().top)),
  ).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(page.locator("article")).toHaveCount(10);
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(20);
  await expect(page.getByLabel("搜索模式")).toHaveValue("CVE");
  await page.getByLabel("搜索模式").fill("");
  await page.getByLabel("实例类型", { exact: true }).selectOption("negative");
  await expect(page.locator("article")).toHaveCount(18);
  await page.getByLabel("搜索模式").fill("cve_2020_35923_patched.rs");
  await expect(page.locator("article")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: /查看详情/ }).click();
  await expect(
    page.getByRole("heading", { name: "CVE-2020-35923", exact: true }),
  ).toBeVisible();
  await expect(page.locator("pre")).toBeVisible();
  await expect(page.locator("pre")).toContainText("pattern CVE-2020-35923");
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已复制", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "pattern CVE-2020-35923",
  );
  await page.screenshot({
    path: "test-results/pattern-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("关联实例类型").selectOption("negative");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "实例详情", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "cve_2020_35923_patched.rs" }),
  ).toBeVisible();
  await expect(page.locator(".selected-line")).toContainText("partial_cmp");
  await expect(page.locator("main")).toContainText("Not Run");
  await expect(page.locator("main")).toContainText("未验证");
  await page.screenshot({
    path: "test-results/instance-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(page.locator("main")).not.toContainText(
    /Excel|工作簿|白色|橙色|第 125 行|\.xlsx/i,
  );
  await expect(page.locator("main")).toContainText("基准中包含目标诊断");
  await expect(page.locator("main")).toContainText("Negative");
  await page.reload();
  await expect(page.locator(".selected-line")).toBeVisible();
  await page.getByRole("link", { name: /查看详情/ }).click();
  await expect(
    page.getByRole("heading", { name: "CVE-2020-35923", exact: true }),
  ).toBeVisible();
  await page.goto(`${base}/#/`);
  await page.getByLabel("搜索模式").fill("no-such-pattern");
  await expect(
    page.getByRole("heading", { name: "没有找到符合条件的模式" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByLabel("实例关联", { exact: true }).selectOption("no");
  await expect(page.locator("article")).toHaveCount(
    Math.min(
      20,
      data.patterns.filter(
        (p: any) =>
          !data.instances.some((i: any) => i.patternIds.includes(p.id)),
      ).length,
    ),
  );
  await page.getByLabel("实例关联", { exact: true }).selectOption("yes");
  await page.getByLabel("标签", { exact: true }).selectOption("指针");
  await page.getByLabel("排序", { exact: true }).selectOption("count");
  await expect(page).toHaveURL(/sort=count/);
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByLabel("检测状态", { exact: true }).selectOption("detectable");
  await expect(page.locator("article")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "没有找到符合条件的模式" }),
  ).toBeVisible();
  await page.goto(`${base}/#/patterns/missing`);
  await expect(
    page.getByRole("heading", { name: "没有找到这个页面" }),
  ).toBeVisible();
  await page.goto(`${base}/#/about`);
  await expect(page.getByRole("heading", { name: "数据说明" })).toBeVisible();
  await page.goto(`${base}/#/`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "RPL Atlas" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "切换导航" }).click();
  await expect(
    page.getByRole("link", { name: "数据说明", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "数据说明", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "数据说明", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/pattern-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(`${base}/#/instances/case-dc30fd1e915c0c8e`);
  await expect(
    page.getByRole("heading", { name: "没有找到这个页面" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${base}/#/patterns/codeql%2Fctor-initialization`);
  const diagnostics = page.getByRole("region", { name: "诊断说明 3 组" });
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.locator("details")).toHaveCount(3);
  await diagnostics
    .locator("summary")
    .filter({ hasText: "ctor_initialization_stdout" })
    .click();
  await expect(
    diagnostics.getByText(
      "use a non-std alternative such as `libc::STDOUT_FILENO`",
      { exact: true },
    ),
  ).toBeVisible();
  await diagnostics
    .locator("summary")
    .filter({ hasText: "ctor_initialization_stderr" })
    .click();
  await expect(
    diagnostics.getByText(
      "use a non-std alternative such as `libc::STDERR_FILENO`",
      { exact: true },
    ),
  ).toBeVisible();
  const originalUrl = page.url();
  await diagnostics.getByRole("button", { name: /ctor_stdout/ }).click();
  await expect(page.locator(".selected-line")).toHaveAttribute(
    "data-line",
    "17",
  );
  await expect(page.locator(".selected-line")).toBeInViewport();
  expect(page.url()).toBe(originalUrl);
  expect(context.pages().length).toBe(1);
  await diagnostics.getByRole("button", { name: /ctor_stdout/ }).click();
  await expect(page.locator(".selected-line")).toBeInViewport();
  await diagnostics
    .getByRole("button", { name: "在本页查看诊断源码 ↓" })
    .first()
    .click();
  await expect(page.locator(".selected-line")).toHaveCount(8);
  await expect(page.locator(".selected-line").first()).toHaveAttribute(
    "data-line",
    "34",
  );
  await page.screenshot({
    path: "test-results/diagnostics-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/diagnostics-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const sharedCase = data.instances.find((i: any) =>
    i.patternIds.includes("cve/CVE-2019-15551"),
  );
  await page.goto(`${base}/#/instances/${sharedCase.id}`);
  const instanceDiagnostics = page.getByRole("region", {
    name: "诊断说明 1 组",
  });
  await instanceDiagnostics
    .getByRole("button", { name: /double_drop_on_corner_case/ })
    .click();
  await expect(
    page.locator("pre").filter({ hasText: "pattern CVE-2021-15551" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[id^="code-"] .selected-line')
      .filter({ hasText: "double_drop_on_corner_case[" }),
  ).toBeInViewport();
  expect(context.pages().length).toBe(1);
  // Verify every generated source resource and fixed-revision GitHub link, beyond the sample UI route.
  for (const f of data.files) {
    expect(f.githubUrl).toContain(data.manifest.sourceCommit);
    const response = await context.request.get(`${base}/generated/${f.asset}`);
    expect(response.ok()).toBe(true);
  }
  // Check all product routes so source-material notes cannot remain on an unvisited card/detail.
  const routes = [
    { path: "/", name: "RPL Atlas" },
    { path: "/about", name: "数据说明" },
    ...data.patterns.map((p: any) => ({
      path: `/patterns/${encodeURIComponent(p.id)}`,
      name: p.name,
    })),
    ...data.instances.map((i: any) => ({
      path: `/instances/${i.id}`,
      name: i.name,
    })),
  ];
  for (const route of routes) {
    await page.goto(`${base}/#${route.path}`);
    await expect(
      page.getByRole("heading", { name: route.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      /Excel|工作簿|白色允许清单|橙色|\.xlsx/i,
    );
  }
  expect(errors).toEqual([]);
  const errorPage = await context.newPage();
  await errorPage.route("**/generated/catalog.json", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await errorPage.goto(base);
  await expect(
    errorPage.getByRole("heading", { name: "知识库数据加载失败" }),
  ).toBeVisible();
  await errorPage.close();
  for (const payload of [
    {},
    { ...data, manifest: { ...data.manifest, schemaVersion: 2 } },
  ]) {
    const invalidPage = await context.newPage();
    invalidPage.on("pageerror", (e) => errors.push(e.message));
    await invalidPage.route("**/generated/catalog.json", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      }),
    );
    await invalidPage.goto(base);
    await expect(
      invalidPage.getByRole("heading", { name: "知识库数据加载失败" }),
    ).toBeVisible();
    await expect(
      invalidPage.getByRole("button", { name: "重新加载" }),
    ).toBeVisible();
    await invalidPage.unroute("**/generated/catalog.json");
    await invalidPage.getByRole("button", { name: "重新加载" }).click();
    await expect(
      invalidPage.getByRole("heading", { name: "RPL Atlas" }),
    ).toBeVisible();
    await invalidPage.close();
  }
  expect(errors).toEqual([]);
  await writeFile(
    "test-results/browser-result.json",
    JSON.stringify(
      {
        passed: true,
        consoleErrors: errors,
        patterns: data.patterns.length,
        instances: data.instances.length,
        resourcesChecked: data.files.length,
        routesChecked: routes.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "浏览器验收通过：桌面/手机、分页、筛选组合、路径检索、路由刷新、双向跳转、复制、高亮、空状态、缺失页面、网络失败、全部资源。",
  );
} finally {
  await browser.close();
}
