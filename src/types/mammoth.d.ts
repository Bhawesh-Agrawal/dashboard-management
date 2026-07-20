declare module 'mammoth' {
  export interface ConversionResult {
    value: string;
    messages: any[];
  }

  export interface ConversionOptions {
    styleMap?: string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    transformDocument?: any;
  }

  export function convertToHtml(
    input: { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer },
    options?: ConversionOptions
  ): Promise<ConversionResult>;

  export function convertToMarkdown(
    input: { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer },
    options?: ConversionOptions
  ): Promise<ConversionResult>;
  
  export function extractRawText(
    input: { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer }
  ): Promise<ConversionResult>;
}
