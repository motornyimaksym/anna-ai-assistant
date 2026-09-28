export class TextUtils {
  static replaceLongDashes(text: string): string {
    return text.replace(/[–—―]/g, '-');
  }
}
