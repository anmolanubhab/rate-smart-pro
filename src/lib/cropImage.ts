// Canvas-based crop for the avatar upload flow. Always outputs a fixed
// 512x512 JPEG regardless of the source format/aspect ratio, so downstream
// storage path/extension stays constant ("<user-id>/avatar.jpg").

export type PixelCrop = { x: number; y: number; width: number; height: number };

const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = src;
  });
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export async function getCroppedImg(imageSrc: string, cropPixels: PixelCrop, rotation = 0): Promise<Blob> {
  const image = await loadImage(imageSrc);

  const rotRad = degreesToRadians(rotation);

  // Canvas big enough to hold the rotated source image without clipping.
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));
  const rotatedWidth = image.width * cos + image.height * sin;
  const rotatedHeight = image.width * sin + image.height * cos;

  const rotateCanvas = document.createElement("canvas");
  rotateCanvas.width = rotatedWidth;
  rotateCanvas.height = rotatedHeight;
  const rotateCtx = rotateCanvas.getContext("2d");
  if (!rotateCtx) throw new Error("Canvas 2D context unavailable");

  rotateCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
  rotateCtx.rotate(rotRad);
  rotateCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = OUTPUT_SIZE;
  outputCanvas.height = OUTPUT_SIZE;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("Canvas 2D context unavailable");

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  outputCtx.drawImage(
    rotateCanvas,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode cropped image"))),
      "image/jpeg",
      0.92
    );
  });
}
