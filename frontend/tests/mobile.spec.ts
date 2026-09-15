import { expect, test } from "@playwright/test";

test("mobile humming upload, touch pitch edit, resize and draft restore", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await expect(page.getByRole("button", { name: "흥얼거리기" })).toHaveAttribute("aria-pressed", "true");
  await page.locator('input[type="file"]').setInputFiles(process.env.HUM_TEST_WAV || "/tmp/hum-smoke/test-melody.wav");
  await page.getByRole("button", { name: "분석하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "우리가 들은 멜로디입니다." })).toBeVisible({ timeout: 150_000 });
  const note = page.locator(".note").first();
  await note.scrollIntoViewIfNeeded();
  const before = await note.getAttribute("aria-label");
  const box = (await note.boundingBox())!;
  // A touch pointer follows the same capture/drag path as a phone browser.
  await note.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: box.x + box.width / 2, clientY: box.y + 10, bubbles: true });
  await note.dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: box.x + box.width / 2, clientY: box.y + 36, bubbles: true });
  await note.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", bubbles: true });
  expect(await note.getAttribute("aria-label")).not.toBe(before);
  const lengthInput = page.getByRole("spinbutton", { name: "음표 길이" });
  const oldLength = Number(await lengthInput.inputValue());
  const edge = note.locator(".resize.end");
  const edgeBox = (await edge.boundingBox())!;
  await page.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(edgeBox.x + edgeBox.width / 2 + 24, edgeBox.y + edgeBox.height / 2, { steps: 3 });
  await page.mouse.up();
  expect(Number(await lengthInput.inputValue())).toBeGreaterThan(oldLength);
  await page.getByRole("button", { name: "실행 취소" }).click();
  expect(Number(await lengthInput.inputValue())).toBeCloseTo(oldLength, 2);
  await page.getByRole("textbox", { name: "프로젝트 이름" }).fill("모바일 흥얼거리기 검증");
  await page.getByRole("button", { name: "임시 저장" }).click();
  await expect(page.getByText("수정 사항을 저장했습니다.")).toBeVisible();
  const edited = await note.getAttribute("aria-label");
  await page.reload();
  await expect(page.locator(".note").first()).toHaveAttribute("aria-label", edited!);
  await expect(page.getByRole("textbox", { name: "가사 입력" })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/tmp/hum-screens/editor-small-mobile.png", fullPage: true });
});

test("short microphone recording can be retried", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/");
  await page.getByRole("button", { name: "새 노래 만들기" }).click();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await page.getByRole("button", { name: "정지", exact: true }).click();
  await expect(page.locator(".error")).toContainText("녹음이 너무 짧습니다.");
  await expect(page.getByRole("button", { name: "분석하기", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "녹음 시작", exact: true })).toBeEnabled();
});
