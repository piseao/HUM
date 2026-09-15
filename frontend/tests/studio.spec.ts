import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("record, analyze with Basic Pitch, edit, play, lock, save and reopen", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const analyzers: AnalyserNode[] = [];
    (window as unknown as { humAnalyzers: AnalyserNode[] }).humAnalyzers =
      analyzers;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: Parameters<typeof connect>
    ) {
      if (args[0] instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        connect.call(this, analyser as unknown as AudioParam);
        analyzers.push(analyser);
      }
      return connect.apply(this, args);
    } as typeof connect;
  });
  await context.grantPermissions(["microphone"]);
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await page.getByRole("button", { name: "노래 부르기" }).click();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByText("녹음 중", { exact: true })).toBeVisible();
  await page.waitForTimeout(10_000);
  const canvasSignal = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((v) => v !== 0),
    );
  expect(canvasSignal).toBeTruthy();
  await page.getByRole("button", { name: "정지", exact: true }).click();
  await page.getByRole("button", { name: "분석하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "우리가 들은 멜로디입니다." }),
  ).toBeVisible({ timeout: 150_000 });
  await expect(page.locator(".note").first()).toBeVisible();
  const first = page.locator(".note").first();
  await first.scrollIntoViewIfNeeded();
  const before = await first.getAttribute("aria-label");
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 26, {
    steps: 5,
  });
  await page.mouse.up();
  expect(await first.getAttribute("aria-label")).not.toBe(before);
  const length = page.getByRole("spinbutton", { name: "음표 길이" });
  const oldLength = Number(await length.inputValue());
  await length.fill(String(oldLength + 0.2));
  await page
    .getByRole("textbox", { name: "프로젝트 이름" })
    .fill("브라우저 검증 멜로디");
  await page.getByRole("textbox", { name: "가사 입력" }).fill("라 라라 라라라");
  await expect(
    page.getByText("가사 자동 인식은 아직 연결되지 않았습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "멜로디 듣기" }).click();
  await expect(page.getByRole("button", { name: "재생 정지" })).toBeVisible();
  await page.waitForTimeout(800);
  const audible = await page.evaluate(() =>
    (window as unknown as { humAnalyzers: AnalyserNode[] }).humAnalyzers.some(
      (analyser) => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return samples.some((value) => Math.abs(value) > 0.0001);
      },
    ),
  );
  expect(audible).toBeTruthy();
  await expect(page.locator(".playhead")).toBeVisible();
  await page.getByRole("button", { name: "재생 정지" }).click();
  await mkdir("/tmp/hum-screens", { recursive: true });
  await page.screenshot({
    path: "/tmp/hum-screens/editor-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "내 멜로디 확정", exact: true })
    .click();
  await page.getByRole("button", { name: "확정하기", exact: true }).click();
  await expect(
    page.getByText("이 멜로디를 원곡 멜로디로 저장합니다.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "프로젝트 저장", exact: true })
    .click();
  await expect(page.getByText("프로젝트가 저장되었습니다.")).toBeVisible();
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await expect(
    second.getByRole("textbox", { name: "프로젝트 이름" }),
  ).toHaveValue("브라우저 검증 멜로디");
  await expect(second.getByRole("textbox", { name: "가사 입력" })).toHaveValue(
    "라 라라 라라라",
  );
  await expect(second.locator(".note").first()).toHaveAttribute(
    "aria-label",
    (await first.getAttribute("aria-label"))!,
  );
  await second.locator(".note").first().click();
  await expect(
    second.getByRole("combobox", { name: "음 높이" }),
  ).toBeDisabled();
  await second.setViewportSize({ width: 390, height: 844 });
  await second.screenshot({
    path: "/tmp/hum-screens/editor-mobile.png",
    fullPage: true,
  });
  expect(
    await second.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await second.getByRole("button", { name: "HUM 홈" }).click();
  await expect(
    second.getByRole("button", { name: /브라우저 검증 멜로디/ }).first(),
  ).toBeVisible();
  await second.screenshot({
    path: "/tmp/hum-screens/home-mobile.png",
    fullPage: true,
  });
  await second.setViewportSize({ width: 1440, height: 1000 });
  await second.screenshot({
    path: "/tmp/hum-screens/home-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("microphone denial shows a Korean error", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.locator(".error")).toContainText(
    "마이크 권한이 거부되었습니다.",
  );
  await expect(
    page.getByRole("button", { name: "분석하기", exact: true }),
  ).toBeDisabled();
});

test("connection failure is readable", async ({ page }) => {
  await page.route("**/api/projects", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error")).toContainText(
    "서버에 연결할 수 없습니다.",
  );
  await expect(
    page.getByRole("button", { name: "새 노래 만들기" }),
  ).toBeVisible();
});
