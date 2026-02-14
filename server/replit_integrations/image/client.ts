import { Buffer } from "node:buffer";

const DISABLED_MSG = "Replit image integrations disabled — all AI calls must go through ai-gateway";

export async function generateImageBuffer(
  _prompt: string,
  _size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  throw new Error(DISABLED_MSG);
}

export async function editImages(
  _imageFiles: string[],
  _prompt: string,
  _outputPath?: string
): Promise<Buffer> {
  throw new Error(DISABLED_MSG);
}
