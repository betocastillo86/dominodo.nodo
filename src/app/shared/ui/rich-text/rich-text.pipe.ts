import { Pipe, PipeTransform } from '@angular/core';
import { richTextToRenderedHtml } from './rich-text';

/**
 * Renders a stored rich-text value for `[innerHTML]`.
 *
 * Bind it as `[innerHTML]="value | richText"`, never with `bypassSecurityTrust*`:
 * the string still goes through Angular's own HTML sanitizer afterwards, which
 * is what keeps a value written before this feature — or edited straight in the
 * database — from being able to inject anything.
 */
@Pipe({ name: 'richText', standalone: true })
export class RichTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return richTextToRenderedHtml(value);
  }
}
