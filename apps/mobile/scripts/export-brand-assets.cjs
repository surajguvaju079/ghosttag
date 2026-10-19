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
  return result.source;
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
async function validate() {
  for (const [name, size] of [
    ["app-icon.png", 1024],
    ["adaptive-foreground.png", 1024],
    ["splash.png", 1024],
    ["mascot.png", 512],
    ["favicon.png", 64],
  ]) {
    const image = await getPngInfo(join(directory, name));
    if (image.width !== size || image.height !== size)
      throw new Error(`Incorrect dimensions: ${name}`);
  }
  const Jimp = sdkRequire("jimp-compact");
  const icon = await Jimp.read(await readFile(join(directory, "app-icon.png")));
  for (let index = 3; index < icon.bitmap.data.length; index += 4)
    if (icon.bitmap.data[index] !== 255)
      throw new Error("iOS icon must be opaque");
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
}
async function main() {
  if (!process.argv.includes("--check")) {
    const files = [
      [
        "app-icon.png",
        () => resize("app-icon-source.png", "app-icon.png", 1024, true),
      ],
      [
        "adaptive-foreground.png",
        () => padded("ghost-mascot.png", "adaptive-foreground.png"),
      ],
      ["splash.png", () => resize("ghost-mascot.png", "splash.png", 1024)],
      ["mascot.png", () => resize("ghost-mascot.png", "mascot.png", 512)],
      [
        "favicon.png",
        () => resize("app-icon-source.png", "favicon.png", 64, true),
      ],
    ];
    for (const [name, create] of files) {
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
