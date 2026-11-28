import { test, expect } from '@playwright/test';

// Una nota escrita con un clic en un lugar libre se dibuja donde se hizo clic: el editor prueba el dibujo de Verovio (que no
// es proporcional al tiempo) y elige el `at` cuya nota queda en esa x. La tolerancia es media semicorchea de ancho.
async function open(page) {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.measure').first()).toBeVisible();
  await page.evaluate(() => localStorage.clear());
}

async function writeAt(page, mi, fraction) {
  const staff = await page.locator('#scoreStage g.measure').nth(mi).locator(':scope > g.staff > path').nth(2).boundingBox();
  const x = staff.x + staff.width * fraction;
  await page.mouse.click(x, staff.y);
  return { x, tolerance: staff.width / 16 };
}

test('una segunda negra a la derecha y una negra en otro compás también se dibujan donde se hizo clic', async ({ page }) => {
  await open(page);
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('4');
  const first = await writeAt(page, 0, 0.3);
  await expect(page.locator('#scoreStage g.note')).toHaveCount(1);
  const second = await writeAt(page, 0, 0.92);
  await expect(page.locator('#scoreStage g.note')).toHaveCount(2);
  const third = await writeAt(page, 1, 0.5);
  await expect(page.locator('#scoreStage g.note')).toHaveCount(3);
  const centers = await page.evaluate(() => [...document.querySelectorAll('#scoreStage g.note .notehead')].map((n) => { const r = n.getBoundingClientRect(); return (r.left + r.right) / 2; }));
  // Un clic demasiado cerca de la nota anterior no puede quedar más a la izquierda de su fin: por eso se hace lejos de ella.
  expect(Math.abs(centers[1] - second.x)).toBeLessThan(second.tolerance * 1.5);
  expect(Math.abs(centers[2] - third.x)).toBeLessThan(third.tolerance * 1.5);
  expect(first.x).toBeLessThan(second.x);
});

for (const fraction of [0.3, 0.5, 0.7]) {
  test(`una negra en el ${fraction * 100}% de un compás vacío se dibuja donde se hizo clic y no se mueve al volver a dibujar`, async ({ page }) => {
    await open(page);
    const staff = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').nth(2).boundingBox();
    await page.locator('#scoreStage').focus();
    await page.keyboard.press('4');
    const x = staff.x + staff.width * fraction;
    await page.mouse.click(x, staff.y);
    await expect(page.locator('#scoreStage g.note')).toHaveCount(1);
    const drawn = async () => {
      const box = await page.locator('[id="e0-0"] .notehead').boundingBox();
      return box.x + box.width / 2;
    };
    const first = await drawn();
    const grid = staff.width / 16; // media semicorchea
    expect(Math.abs(first - x)).toBeLessThan(grid);
    await page.setViewportSize({ width: 1441, height: 1000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(400);
    expect(Math.abs((await drawn()) - first)).toBeLessThan(3);
  });
}
