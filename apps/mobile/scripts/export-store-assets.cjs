/* global __dirname */
const { createRequire } = require("node:module");
const { mkdir, writeFile } = require("node:fs/promises");
const { resolve, join } = require("node:path");
const sdkRequire = createRequire(require.resolve("expo/package.json"));
const { generateImageAsync, getPngInfo } = sdkRequire("@expo/image-utils");
async function main() {
  const projectRoot = resolve(__dirname, "..");
  const directory = resolve(
    projectRoot,
    "../../docs/release/google-play/assets",
  );
  const file = join(directory, "play-icon.png");
  const { source } = await generateImageAsync(
    { projectRoot, cacheType: "ghosttag-store" },
    {
      src: join(projectRoot, "assets/brand/app-icon-source.png"),
      name: "play-icon.png",
      width: 512,
      height: 512,
      resizeMode: "contain",
      removeTransparency: true,
      backgroundColor: "#0F0B1F",
    },
  );
  await mkdir(directory, { recursive: true });
  await writeFile(file, source);
  const info = await getPngInfo(file);
  if (info.width !== 512 || info.height !== 512 || source.length > 1024 * 1024)
    throw new Error("Play icon must be 512px square and at most 1MB");
  const Jimp = sdkRequire("jimp-compact");
  const image = await Jimp.read(source);
  for (let i = 3; i < image.bitmap.data.length; i += 4)
    if (image.bitmap.data[i] !== 255)
      throw new Error("Play icon must be opaque");
  console.log(
    "Exported validated 512px opaque Play icon from approved brand source.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
