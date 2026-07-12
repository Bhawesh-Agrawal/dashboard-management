"use client";

import { pdfjs } from "react-pdf";

const PDFJS_VERSION = pdfjs.version;

let configured = false;

export function configurePdfWorker() {
  if (configured) return;
  if (typeof window === "undefined") return;

  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

  configured = true;
}

export function getPdfDocumentProxy(url: string, httpHeaders?: Record<string, string>) {
  configurePdfWorker();

  const loadingTask = pdfjs.getDocument({
    url,
    httpHeaders,
    enableXfa: false,
  });

  return loadingTask.promise;
}

export { pdfjs };
