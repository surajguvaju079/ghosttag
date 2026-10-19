// Deterministic platform exports only. Creative artwork is generated separately;
// Expo's own image pipeline handles sizing, alpha, and adaptive-icon margins.
/* global __dirname */
const { createRequire } = require("node:module");
const { writeFile, readFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const sdkRequire = createRequire(require.resolve("expo/package.json"));
const {
  generateImageAsync,
  generateImageBackgroundAsync,
  compositeImagesAsync,
  getPngInfo,
} = sdkRequire("@expo/image-utils");
const projectRoot = resolve(__dirname, "..");
const directory = join(projectRoot, "assets", "brand");
async function resize(source, name, size, opaque = false) {
  const result = await generateImageAsync(
    { projectRoot, cacheType: "ghosttag-brand" },
    {
      src: join(directory, source),
      name,
      width: size,
      height: size,
      resizeMode: "contain",
      backgroundColor: opaque ? "#0F0B1F" : "transparent",
      removeTransparency: opaque,
    },
  );
  if (opaque) return result.source;
  const Jimp = sdkRequire("jimp-compact");
  const image = await Jimp.read(result.source);
  // Remove near-invisible alpha=1 export noise at the transparent canvas edges.
  for (let i = 3; i < image.bitmap.data.length; i += 4)
    if (image.bitmap.data[i] <= 1) image.bitmap.data[i] = 0;
  return image.getBufferAsync(Jimp.MIME_PNG);
}
async function padded(source, name) {
  const foreground = await resize(source, name, 768);
  const background = await generateImageBackgroundAsync({
    width: 1024,
    height: 1024,
    resizeMode: "contain",
    backgroundColor: "transparent",
  });
  return compositeImagesAsync({ foreground, background, x: 128, y: 128 });
}
async function monochrome() {
  const Jimp = sdkRequire("jimp-compact");
  const source = await Jimp.read(join(directory, "monochrome-source.png"));
  // Flatten the dedicated line-art master to a single white alpha mask. Only
  // resampling the hard mask introduces edge antialiasing, never a shadow/glow.
  for (let i = 0; i < source.bitmap.data.length; i += 4) {
    const visible =
      source.bitmap.data[i + 3] >= 128 &&
      (source.bitmap.data[i] +
        source.bitmap.data[i + 1] +
        source.bitmap.data[i + 2]) /
        3 >=
        128;
    source.bitmap.data[i] = 255;
    source.bitmap.data[i + 1] = 255;
    source.bitmap.data[i + 2] = 255;
    source.bitmap.data[i + 3] = visible ? 255 : 0;
  }
  source.autocrop();
  const { width, height } = source.bitmap;
  let radius = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (source.bitmap.data[(y * width + x) * 4 + 3])
        radius = Math.max(
          radius,
          Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2),
        );
  if (!radius) throw new Error("Empty monochrome master");
  // 300px radius leaves room for resampling inside the 312.89px safe circle.
  const scale = 300 / radius;
  source.resize(Math.round(width * scale), Math.round(height * scale));
  const canvas = new Jimp(1024, 1024, 0x00000000);
  canvas.composite(
    source,
    Math.floor((1024 - source.bitmap.width) / 2),
    Math.floor((1024 - source.bitmap.height) / 2),
  );
  for (let i = 0; i < canvas.bitmap.data.length; i += 4) {
    canvas.bitmap.data[i] = 255;
    canvas.bitmap.data[i + 1] = 255;
    canvas.bitmap.data[i + 2] = 255;
  }
  return canvas.getBufferAsync(Jimp.MIME_PNG);
}
async function validate() {
  for (const [name, size] of [
    ["app-icon.png", 1024],
    ["adaptive-foreground.png", 1024],
    ["adaptive-monochrome.png", 1024],
    ["splash.png", 1024],
    ["mascot.png", 512],
    ["favicon.png", 64],
  ]) {
    const image = await getPngInfo(join(directory, name));
    if (image.width !== size || image.height !== size)
      throw new Error(`Incorrect dimensions: ${name}`);
  }
  const Jimp = sdkRequire("jimp-compact");
  const { expo } = JSON.parse(
    await readFile(join(projectRoot, "app.json"), "utf8"),
  );
  if (
    expo.android.adaptiveIcon.backgroundColor !== "#0F0B1F" ||
    expo.android.adaptiveIcon.backgroundImage
  )
    throw new Error("Adaptive background must remain solid midnight violet");
  if (
    expo.android.adaptiveIcon.monochromeImage !==
    "./assets/brand/adaptive-monochrome.png"
  )
    throw new Error("Dedicated monochrome layer must be configured");
  const splash = expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  )[1];
  if (
    splash.resizeMode !== "contain" ||
    splash.imageWidth !== 200 ||
    splash.backgroundColor !== "#0F0B1F" ||
    expo.userInterfaceStyle !== "dark"
  )
    throw new Error("Splash must remain contained, 200pt, and dark");
  for (const name of ["app-icon.png", "favicon.png"]) {
    const icon = await Jimp.read(join(directory, name));
    for (let index = 3; index < icon.bitmap.data.length; index += 4)
      if (icon.bitmap.data[index] !== 255)
        throw new Error(`${name} must be opaque`);
  }
  for (const name of ["splash.png", "mascot.png", "adaptive-foreground.png"]) {
    const image = await Jimp.read(join(directory, name));
    const { width, height, data } = image.bitmap;
    let visible = false;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha) visible = true;
        if (
          (x === 0 || y === 0 || x === width - 1 || y === height - 1) &&
          alpha
        )
          throw new Error(`${name} must have transparent outer edges`);
      }
    if (!visible) throw new Error(`${name} is empty`);
  }
  const foreground = await Jimp.read(
    await readFile(join(directory, "adaptive-foreground.png")),
  );
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 1024; x++) {
      const alpha = foreground.bitmap.data[(y * 1024 + x) * 4 + 3];
      const safeRadius = (1024 * 66) / 108 / 2;
      if (alpha >= 128 && (x - 511.5) ** 2 + (y - 511.5) ** 2 > safeRadius ** 2)
        throw new Error(
          "Solid adaptive artwork is outside Android's safe circle",
        );
      if (
        (x < 128 || x >= 896 || y < 128 || y >= 896) &&
        foreground.bitmap.data[(y * 1024 + x) * 4 + 3] !== 0
      )
        throw new Error("Adaptive foreground is outside its padded canvas");
    }
  console.log(
    "Brand exports valid: dimensions, opaque iOS icon, transparent adaptive margins and solid-artwork safe circle.",
  );
  const mono = await Jimp.read(join(directory, "adaptive-monochrome.png"));
  let pixels = 0;
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4;
      const data = mono.bitmap.data;
      if (!data[i + 3]) continue;
      pixels++;
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255)
        throw new Error("Monochrome layer contains nonwhite pixels");
      if (Math.hypot(x - 511.5, y - 511.5) > (1024 * 66) / 108 / 2)
        throw new Error("Monochrome artwork outside adaptive safe circle");
    }
  if (pixels < 10000)
    throw new Error("Monochrome artwork is empty or too small");
  for (const [name, create] of exportsToCreate()) {
    const actual = await Jimp.read(join(directory, name));
    const expected = await Jimp.read(await create());
    if (!actual.bitmap.data.equals(expected.bitmap.data))
      throw new Error(`Asset differs from its source export: ${name}`);
  }
  console.log(
    "Monochrome is white-only and inside the safe circle; all exports match their masters and configuration.",
  );
}
function exportsToCreate() {
  return [
    [
      "app-icon.png",
      () => resize("app-icon-source.png", "app-icon.png", 1024, true),
    ],
    [
      "adaptive-foreground.png",
      () => padded("ghost-mascot.png", "adaptive-foreground.png"),
    ],
    ["splash.png", () => resize("ghost-mascot.png", "splash.png", 1024)],
    ["adaptive-monochrome.png", monochrome],
    ["mascot.png", () => resize("ghost-mascot.png", "mascot.png", 512)],
    [
      "favicon.png",
      () => resize("app-icon-source.png", "favicon.png", 64, true),
    ],
  ];
}
async function main() {
  if (!process.argv.includes("--check")) {
    for (const [name, create] of exportsToCreate()) {
      await writeFile(join(directory, name), await create());
      console.log(`Exported ${name}`);
    }
  }
  await validate();
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
