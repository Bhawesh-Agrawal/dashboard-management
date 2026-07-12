"use server";

import { processOcr, isSupportedImageType, getConfidenceDescription } from "./ocr";
import { createNote } from "./actions";

/**
 * Process an image through OCR and create a note
 * @param formData - FormData containing the image file and optional metadata
 * @returns Result with note creation status
 */
export async function processOcrAction(formData: FormData): Promise<{
  success: boolean;
  noteId?: string;
  text?: string;
  confidence?: number;
  confidenceDescription?: string;
  error?: string;
  sourceLink?: string;
}> {
  try {
    const imageFile = formData.get("image") as File;
    const sourceLink = formData.get("sourceLink") as string | null;
    const courseId = formData.get("courseId") as string | null;

    if (!imageFile) {
      return {
        success: false,
        error: "No image file provided",
      };
    }

    // Validate file type
    if (!isSupportedImageType(imageFile.type)) {
      return {
        success: false,
        error: `Unsupported image type: ${imageFile.type}. Please use JPEG, PNG, GIF, BMP, TIFF, or WebP.`,
      };
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (imageFile.size > maxSize) {
      return {
        success: false,
        error: "Image file is too large. Maximum size is 10MB.",
      };
    }

    // Convert file to buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Process OCR
    const ocrResult = await processOcr(imageBuffer);

    if (!ocrResult.success) {
      return {
        success: false,
        error: ocrResult.error,
        sourceLink: sourceLink || undefined,
      };
    }

    // Create note with OCR text
    const noteContent = ocrResult.text || "";
    const noteResult = await createNote({
      content: noteContent,
      sourceType: "ocr_photo",
      sourceLink: sourceLink || undefined,
      courseId: courseId || undefined,
      tags: ["ocr"],
    });

    if (!noteResult.ok) {
      throw new Error(noteResult.error);
    }

    return {
      success: true,
      noteId: noteResult.data.id,
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      confidenceDescription: ocrResult.confidence 
        ? getConfidenceDescription(ocrResult.confidence) 
        : undefined,
      sourceLink: sourceLink || undefined,
    };
  } catch (error) {
    console.error("OCR action failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during OCR processing",
    };
  }
}
