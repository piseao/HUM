import { test, expect } from "@playwright/test";

test("analysis progress is truthful, resumes after reload, and completes", async ({
  page,
}) => {
  const project = {
    id: "progress-test",
    title: "진행률 검증",
    revision: 0,
    input_type: "hum",
    status: "draft",
    tempo: 120,
    tempo_source: "default",
    analysis_seconds: null as number | null,
    audio: {
      original: "original_audio.wav",
      duration: 10,
      size: 100,
      content_type: "audio/wav",
    },
    melody: { original_notes: [], edited_notes: [] as object[], locked: false },
    lyrics: { original: "", edited: "", status: "unconfigured" },
  };
  let stage = "pitch_analysis",
    progress = 42,
    complete = false,
    fail = false,
    starts = 0,
    polls = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, json: data });
    if (path === "/api/projects") return json([]);
    if (path === "/api/audio/upload")
      return json({ project_id: project.id, project }, 201);
    if (path === "/api/audio/analyze") {
      starts++;
      return json(
        {
          status: "analyzing",
          stage,
          progress,
          message: "목소리에서 음정을 찾고 있어요.",
        },
        202,
      );
    }
    if (path.startsWith("/api/audio/analyze/")) {
      polls++;
      if (fail)
        return json(
          { detail: "멜로디 분석에 실패했습니다. 다시 시도해 주세요." },
          422,
        );
      return json(
        complete
          ? { status: "complete", stage: "complete", progress: 100, project }
          : {
              status: "analyzing",
              stage,
              progress,
              message: "목소리에서 음정을 찾고 있어요.",
            },
      );
    }
    if (path.endsWith("/audio"))
      return route.fulfill({ body: Buffer.from(""), contentType: "audio/wav" });
    return json(project);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      process.env.HUM_TEST_WAV || "/tmp/hum-smoke/test-melody.wav",
    );
  await page.getByRole("button", { name: "분석하기", exact: true }).click();
  const bar = page.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "42");
  await expect(page.locator(".analysis-percent")).toHaveText("42%");
  await page.waitForTimeout(1800);
  await expect(bar).toHaveAttribute("aria-valuenow", "42");
  await expect(page.locator(".analysis-stages .done")).toHaveCount(2);
  await page.reload();
  await expect(bar).toHaveAttribute("aria-valuenow", "42");
  expect(starts).toBe(1);
  const before = polls;
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect.poll(() => polls).toBeGreaterThan(before);
  fail = true;
  await expect(
    page.getByRole("heading", { name: "멜로디를 분석하지 못했어요." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "다시 녹음하기" }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "다시 분석하기", exact: true })
    .click();
  await expect(bar).toHaveAttribute("aria-valuenow", "42");
  stage = "melody_generation";
  progress = 70;
  await expect(bar).toHaveAttribute("aria-valuenow", "70");
  await expect(page.locator(".analysis-stages .done")).toHaveCount(3);
  await page.screenshot({
    path: "/tmp/hum-screens/progress-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  stage = "editor_preparation";
  progress = 90;
  await expect(bar).toHaveAttribute("aria-valuenow", "90");
  project.status = "analyzed";
  project.analysis_seconds = 3.8;
  project.melody.edited_notes = [
    {
      id: "note_1",
      pitch: 60,
      note_name: "C4",
      start: 0,
      end: 1,
      velocity: 0.8,
    },
  ];
  complete = true;
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("1개의 음을 발견했습니다.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "우리가 들은 멜로디입니다." }),
  ).toBeVisible();
  await expect(page.locator(".analysis-summary")).toContainText("3.8초");
  await expect(page.locator(".analysis-summary")).not.toContainText("BPM");
});

test("upload failure stays in progress panel and can return to recording", async ({
  page,
}) => {
  await page.route("**/api/projects", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audio/upload", (route) =>
    route.fulfill({
      status: 422,
      json: { detail: "녹음 파일을 읽지 못했습니다. 다시 녹음해 주세요." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      process.env.HUM_TEST_WAV || "/tmp/hum-smoke/test-melody.wav",
    );
  await page.getByRole("button", { name: "분석하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "멜로디를 분석하지 못했어요." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "다시 분석하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "멜로디를 분석하지 못했어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다시 녹음하기" }).click();
  await expect(
    page.getByRole("button", { name: "녹음 시작", exact: true }),
  ).toBeEnabled();
});
