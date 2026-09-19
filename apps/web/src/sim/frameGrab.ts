/**
 * The "camera frame" sent with each question: 1280 × 960 JPEG, like the Quest's passthrough camera.
 * `render` stretches the hologram view to that size (so the projected part boxes line up exactly);
 * `webcam` uses the laptop camera, to test the copilot on real objects.
 */
export type FrameSource = "render" | "webcam";
export const FRAME_W = 1280;
export const FRAME_H = 960;

let video: HTMLVideoElement | null = null;

async function webcamVideo(): Promise<HTMLVideoElement> {
  if (video && video.readyState >= 2) return video;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: FRAME_W, height: FRAME_H } });
  video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  await video.play();
  return video;
}

export function stopWebcam(): void {
  (video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  video = null;
}

export async function grabFrame(source: FrameSource): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W; canvas.height = FRAME_H;
  const g = canvas.getContext("2d")!;
  if (source === "webcam") g.drawImage(await webcamVideo(), 0, 0, FRAME_W, FRAME_H);
  else {
    const view = document.querySelector<HTMLCanvasElement>(".hologram-canvas");
    if (view) g.drawImage(view, 0, 0, FRAME_W, FRAME_H);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the frame"))), "image/jpeg", 0.75));
}
