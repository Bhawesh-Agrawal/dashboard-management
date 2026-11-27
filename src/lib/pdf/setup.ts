"use client";

import { pdfjs } from "react-pdf";

let configured = false;

export const PDFJS_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
export const PDFJS_CMAP_URL = "/pdfjs/cmaps/";
export const PDFJS_STANDARD_FONTS_URL = "/pdfjs/standard_fonts/";

export function configurePdfWorker() {
  if (configured) return;
  if (typeof window === "undefined") return;

  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

  configured = true;
}

export function getPdfDocumentProxy(url: string, httpHeaders?: Record<string, string>) {
  configurePdfWorker();

  const loadingTask = pdfjs.getDocument({
    url,
    httpHeaders,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
    enableXfa: false,
  });

  return loadingTask.promise;
}

export { pdfjs };
