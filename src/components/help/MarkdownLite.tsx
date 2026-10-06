import type { ReactNode } from 'react';

/**
 * Visor mínimo de Markdown para el manual: títulos (#, ##, ###), párrafos,
 * listas con guion o numeradas (con sangría de un nivel), **negrita**, *cursiva*
 * y `código`. No admite HTML: el texto se pinta siempre como texto.
 */

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      out.push(
        <strong key={key++} className="font-normal text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key++} className="num rounded-none border border-line bg-white/5 px-1.5 py-0.5 text-[0.82em] text-fg">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Item {
  text: string;
  children: string[];
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const id = slugify(text);
      if (level === 1) {
        blocks.push(
          <h1 key={key++} id={id} className="font-serif text-4xl font-normal tracking-[0.04em] text-fg md:text-5xl">
            {text}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={key++} id={id} className="mt-16 scroll-mt-8 border-t border-line pt-8 font-serif text-2xl font-normal tracking-[0.04em] text-fg md:text-3xl">
            {text}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={key++} id={id} className="mt-9 scroll-mt-8 text-[13px] font-normal tracking-[0.2em] text-fg uppercase">
            {text}
          </h3>,
        );
      }
      i++;
      continue;
    }

    const listStart = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (listStart) {
      const ordered = /\d+\./.test(listStart[2]);
      const items: Item[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) {
          // Continuación de un elemento (línea con sangría) o fin de la lista.
          if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
            items[items.length - 1].text += ` ${lines[i].trim()}`;
            i++;
            continue;
          }
          break;
        }
        if (m[1].length >= 2 && items.length) items[items.length - 1].children.push(m[3]);
        else items.push({ text: m[3], children: [] });
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag
          key={key++}
          className={`mt-4 space-y-2.5 pl-6 text-[15px] leading-relaxed font-light text-fg/90 ${ordered ? 'list-decimal marker:text-muted' : 'list-disc marker:text-muted'}`}
        >
          {items.map((item, n) => (
            <li key={n}>
              {inline(item.text)}
              {item.children.length > 0 && (
                <ul className="mt-2 list-[circle] space-y-1.5 pl-5 marker:text-muted">
                  {item.children.map((child, c) => (
                    <li key={c}>{inline(child)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    // Párrafo: líneas seguidas hasta una línea en blanco, título o lista.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className="mt-4 text-[15px] leading-[1.75] font-light text-fg/90">
        {inline(para.join(' '))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
