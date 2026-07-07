import Tesseract from "tesseract.js";

/**
 * Process an image buffer through Tesseract.js OCR
 * @param imageBuffer - The image buffer to process
 * @returns Extracted text or error message
 */
export async function processOcr(imageBuffer: Buffer): Promise<{
  success: boolean;
  text?: string;
  error?: string;
  confidence?: number;
}> {
  try {
    const result = await Tesseract.recognize(imageBuffer, "eng", {
      logger: (m) => {
        // Log progress for debugging
        if (m.status === "recognizing text") {
          console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const { data } = result;
    
    // Check if we got meaningful text
    const text = data.text.trim();
    if (!text) {
      return {
        success: false,
        error: "No text could be extracted from the image. The image may be too blurry or contain only graphics.",
      };
    }

    return {
      success: true,
      text,
      confidence: data.confidence,
    };
  } catch (error) {
    console.error("OCR processing failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during OCR processing",
    };
  }
}

/**
 * Validate that a file is an image supported by Tesseract
 * @param fileType - The MIME type of the file
 * @returns True if the file type is supported
 */
export function isSupportedImageType(fileType: string): boolean {
  const supportedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/webp",
  ];
  return supportedTypes.includes(fileType.toLowerCase());
}

/**
 * Get a human-readable description of OCR confidence
 * @param confidence - The confidence score (0-100)
 * @returns Description of the confidence level
 */
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 90) return "High confidence";
  if (confidence >= 70) return "Moderate confidence - may need some cleanup";
  if (confidence >= 50) return "Low confidence - likely needs manual correction";
  return "Very low confidence - manual entry recommended";
}
