import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ContentChange, QuillEditorComponent, QuillModules } from 'ngx-quill';
import type Quill from 'quill';
import { richTextToHtml, sanitizeRichText } from '../rich-text/rich-text';

/**
 * The portal's small rich-text editor: a Quill instance deliberately cut down
 * to the formatting a policy text actually needs — bold, italic, the two kinds
 * of list, a link, and "clear formatting". No headings, colors, fonts or
 * images: the text is rendered inside a card on a resident's phone, and every
 * byte of markup eats into the field's character budget.
 *
 * Speaks a plain HTML `string` through `ControlValueAccessor`, so a parent
 * binds it with a bare `formControlName` and keeps its usual
 * `Validators.maxLength` — the control's value is the SAME string the API
 * stores, so the client's count and the server's agree.
 *
 * What it does not do is hand Quill's own markup to the form: everything in and
 * out goes through `rich-text.ts`, which both normalizes Quill's bullet lists
 * into real `<ul>`s and turns a legacy plain-text value into paragraphs so the
 * line breaks typed before this editor existed are not lost on the next save.
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [QuillEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rich-text-editor.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
})
export class RichTextEditorComponent implements ControlValueAccessor {
  readonly placeholder = input('');
  /** `id` of the visible label: the toolbar + editor pair is a group, not an input. */
  readonly labelledBy = input('');
  readonly minHeight = input('8rem');
  /** Shown as a counter when set; the parent still owns the actual validator. */
  readonly maxLength = input<number | null>(null);

  readonly disabled = signal(false);
  /** Length of the stored HTML — what the API's limit is measured against. */
  readonly length = signal(0);

  readonly overLimit = computed(() => {
    const max = this.maxLength();
    return max != null && this.length() > max;
  });

  readonly editorStyles = computed(() => ({ minHeight: this.minHeight() }));

  /** Only these buttons, and `formats` makes the same list the paste filter. */
  readonly modules: QuillModules = {
    toolbar: [['bold', 'italic'], [{ list: 'bullet' }, { list: 'ordered' }], ['link'], ['clean']],
  };
  readonly formats = ['bold', 'italic', 'list', 'link'];

  private quill: Quill | null = null;
  /** The value to show, held until Quill exists (it is created asynchronously). */
  private pending = '';
  /** Guards `onChange` while we are the ones writing into the editor. */
  private applying = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  // ── ControlValueAccessor ────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.pending = richTextToHtml(value);
    this.length.set(this.pending.length);
    this.applyPending();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ── Quill ───────────────────────────────────────────────────────────────
  onEditorCreated(quill: Quill): void {
    this.quill = quill;
    // Word's clipboard writes every space as a NON-BREAKING one and every list
    // marker as a glyph plus a tab. Left alone they reach the editor as text
    // that cannot wrap, so a pasted rule shows as one unbreakable line here and
    // breaks mid-word on the resident's phone. Normalizing at the matcher means
    // the admin sees the real result while pasting, not only after saving.
    quill.clipboard.addMatcher(Node.TEXT_NODE, (_node, delta) => {
      for (const op of delta.ops) {
        if (typeof op.insert === 'string') {
          op.insert = op.insert.replace(/[\t\u00A0]+/g, ' ');
        }
      }
      return delta;
    });
    this.applyPending();
  }

  onContentChanged(change: ContentChange): void {
    if (this.applying) return;

    const html = sanitizeRichText(change.html);
    this.length.set(html.length);
    this.onChange(html);
  }

  onEditorBlur(): void {
    this.onTouched();
  }

  private applyPending(): void {
    const quill = this.quill;
    if (!quill) return;

    this.applying = true;
    try {
      // 'silent' so restoring a saved value is not reported back as an edit.
      quill.setContents([], 'silent');
      if (this.pending) {
        quill.clipboard.dangerouslyPasteHTML(this.pending, 'silent');
      }
    } finally {
      this.applying = false;
    }
  }
}
