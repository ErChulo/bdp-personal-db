import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type KeyboardEventHandler } from 'react';
import { highlightCode, type CodeLanguage } from '../utils/codeHighlight';

export function CodeEditor({
  id,
  name,
  ariaLabel,
  value,
  onChange,
  onKeyDown,
  language,
  minHeight = 140,
  placeholder = '',
}: {
  id: string;
  name?: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  language: CodeLanguage;
  minHeight?: number;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const highlighted = useMemo(() => highlightCode(value, language), [value, language]);
  const display = highlighted || (placeholder ? `<span class="code-placeholder">${placeholder}</span>` : '');
  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const [activeLine, setActiveLine] = useState(1);
  const [activeColumn, setActiveColumn] = useState(1);
  const highlightStyle = { ['--active-line' as any]: activeLine } as CSSProperties;

  const updateActiveLine = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, pos);
    const line = before.split('\n').length || 1;
    const column = before.slice(before.lastIndexOf('\n') + 1).length + 1;
    setActiveLine(line);
    setActiveColumn(column);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      const ta = e.currentTarget;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const indent = '  ';
      e.preventDefault();

      if (start !== end) {
        const segment = ta.value.slice(start, end);
        const nextSegment = e.shiftKey
          ? segment.replace(/^  /gm, '')
          : segment.replace(/^/gm, indent);
        const nextValue = ta.value.slice(0, start) + nextSegment + ta.value.slice(end);
        onChange(nextValue);
        requestAnimationFrame(() => {
          ta.setSelectionRange(start, start + nextSegment.length);
          updateActiveLine();
        });
      } else {
        const insert = e.shiftKey ? '' : indent;
        const nextValue = ta.value.slice(0, start) + insert + ta.value.slice(end);
        onChange(nextValue);
        requestAnimationFrame(() => {
          const caret = start + insert.length;
          ta.setSelectionRange(caret, caret);
          updateActiveLine();
        });
      }
      return;
    }
    onKeyDown?.(e);
  };

  useEffect(() => {
    const ta = textareaRef.current;
    const pre = preRef.current;
    const gutter = gutterRef.current;
    if (!ta || !pre || !gutter) return;
    const sync = () => {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
      gutter.scrollTop = ta.scrollTop;
    };
    sync();
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  useEffect(() => {
    updateActiveLine();
  }, [value]);

  return (
    <div className={`code-editor code-editor-${language}`} style={{ minHeight }}>
      <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1} className={i + 1 === activeLine ? 'active' : ''}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-editor-code">
        <div className="code-editor-line-highlight" style={highlightStyle} aria-hidden="true" />
        <pre ref={preRef} className="code-editor-layer" aria-hidden="true" dangerouslySetInnerHTML={{ __html: display }} />
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(updateActiveLine);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={updateActiveLine}
          onClick={updateActiveLine}
          onSelect={updateActiveLine}
          onMouseUp={updateActiveLine}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className="code-editor-input"
          style={{ minHeight }}
        />
        <div className="code-editor-footer" aria-hidden="true">
          <span>Ln {activeLine}, Col {activeColumn}</span>
          <span>{language.toUpperCase()} · Tab inserts spaces</span>
        </div>
      </div>
    </div>
  );
}
