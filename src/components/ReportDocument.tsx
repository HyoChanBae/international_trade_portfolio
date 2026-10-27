import type { MarketReportData } from '../lib/lukaApi';

type ReportTable = { headers: string[]; rows: string[][] };
type ReportBlock = { heading?: string; items: string[]; table?: ReportTable };
type ReportSection = { title: string; level: number; blocks: ReportBlock[] };

const regimeSummaries: Record<string, string> = {
  GOLDILOCKS: '성장은 버티고 물가는 내려가는, 위험자산에 가장 우호적인 조합',
  골디락스: '성장은 버티고 물가는 내려가는, 위험자산에 가장 우호적인 조합',
  REFLATION: '성장과 물가가 함께 올라가는, 실물·경기민감 자산이 앞서는 조합',
  리플레이션: '성장과 물가가 함께 올라가는, 실물·경기민감 자산이 앞서는 조합',
  STAGFLATION: '성장은 꺾이는데 물가는 버티는, 방어와 실물자산이 동시에 필요한 조합',
  스태그플레이션: '성장은 꺾이는데 물가는 버티는, 방어와 실물자산이 동시에 필요한 조합',
  SLOWDOWN: '성장과 물가가 함께 내려가는, 금리 민감 방어주와 채권이 앞서는 조합',
  '둔화·디스인플레': '성장과 물가가 함께 내려가는, 금리 민감 방어주와 채권이 앞서는 조합',
  '둔화-디스인플레': '성장과 물가가 함께 내려가는, 금리 민감 방어주와 채권이 앞서는 조합',
  UNRESOLVED: '성장 또는 물가 축을 산출할 수 없어 4분면 중 어디인지 특정하지 못하는 상태',
  '판정 보류': '성장 또는 물가 축을 산출할 수 없어 4분면 중 어디인지 특정하지 못하는 상태',
};

const sourceTimePattern = /^기준 시각:\s*(.+)$/;
const headingPattern = /^(#{2,3})\s*(.+)$/;
const bulletPattern = /^[-*•·ㆍ]\s*(.+)$/;

function expandItem(text: string) {
  const parts = text.split(/\s*;\s*/).map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) return parts;
  return text.split(/(?<=[.。])\s+/).map((item) => item.trim()).filter(Boolean);
}

function tableCells(line: string) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function parseMarkdown(lines: string[]): ReportSection[] {
  const sections: ReportSection[] = [];
  let section: ReportSection | null = null;
  let block: ReportBlock | null = null;
  let table: ReportTable | null = null;

  const ensureSection = () => {
    if (!section) section = { title: '섹터 리포트', level: 2, blocks: [] };
    return section;
  };
  const flushTable = () => {
    if (!table) return;
    ensureSection().blocks.push({ items: [], table });
    table = null;
  };
  const flushBlock = () => {
    if (!block || (!block.heading && block.items.length === 0)) return;
    ensureSection().blocks.push(block);
    block = null;
  };
  const flushSection = () => {
    flushTable();
    flushBlock();
    if (section) sections.push(section);
    section = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || sourceTimePattern.test(line)) return;
    if (/^\|?(?::?-+:?\|)+:?-+:?\|?$/.test(line.replaceAll(' ', ''))) return;
    if (line.startsWith('|') && line.indexOf('|', 1) >= 0) {
      flushBlock();
      const cells = tableCells(line);
      if (!table) table = { headers: cells, rows: [] };
      else table.rows.push(cells);
      return;
    }
    flushTable();
    const heading = line.match(headingPattern);
    if (heading) {
      flushSection();
      section = { title: heading[2].trim(), level: heading[1].length, blocks: [] };
      return;
    }
    const bullet = line.match(bulletPattern);
    if (bullet) {
      if (!block) block = { items: [] };
      block.items.push(...expandItem(bullet[1].trim()));
      return;
    }
    flushBlock();
    block = { heading: line.replace(/\s+-\s*$/, '').trim(), items: [] };
  });
  flushSection();
  return sections;
}

function parsePlain(lines: string[]): ReportSection[] {
  const sections: ReportSection[] = [];
  let title = '';
  let items: string[] = [];
  const flush = () => {
    if (title && items.length) sections.push({ title, level: 2, blocks: [{ items }] });
    items = [];
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || sourceTimePattern.test(line)) return;
    const bullet = line.match(bulletPattern);
    if (bullet) {
      items.push(...expandItem(bullet[1].trim()));
      return;
    }
    flush();
    title = line.replace(/\s+-\s*$/, '').trim();
  });
  flush();
  return sections;
}

function parseReport(raw: string) {
  const lines = raw.replaceAll('\r\n', '\n').split('\n');
  const sourceTime = lines.map((line) => line.trim().match(sourceTimePattern)?.[1]).find(Boolean) || '';
  const sections = lines.some((line) => headingPattern.test(line.trim()))
    ? parseMarkdown(lines)
    : parsePlain(lines);
  return { sourceTime, sections };
}

function contextView(raw: unknown) {
  if (raw == null) return { label: '', summary: '' };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { label: '', summary: '' };
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return { label: text, summary: regimeSummaries[text] || regimeSummaries[text.toUpperCase()] || '' };
    }
    try { value = JSON.parse(text); } catch { return { label: '', summary: '' }; }
  }
  if (!value || typeof value !== 'object') return { label: '', summary: '' };
  const regime = (value as { regime?: unknown }).regime;
  if (!regime || typeof regime !== 'object') return { label: '', summary: '' };
  const item = regime as { key?: unknown; name?: unknown; summary?: unknown };
  const key = typeof item.key === 'string' ? item.key.trim() : '';
  const label = typeof item.name === 'string' ? item.name.trim() : key;
  const fallback = typeof item.summary === 'string' ? item.summary.trim() : '';
  return { label, summary: regimeSummaries[key] || regimeSummaries[key.toUpperCase()] || regimeSummaries[label] || fallback };
}

function dateDisplay(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function tone(value: string) {
  const text = value.trim();
  if (/^[+▲]\s*\d/.test(text)) return 'positive';
  if (/^[-−▼]\s*\d/.test(text)) return 'negative';
  return '';
}

export function ReportDocument({
  title, data, wide = false, emptyMessage,
}: {
  title: string;
  data: MarketReportData | null;
  wide?: boolean;
  emptyMessage: string;
}) {
  if (!data) return <article className={`card live-report-doc ${wide ? 'wide' : ''}`}><h2>{title}</h2><p className="data-state">{emptyMessage}</p></article>;
  const parsed = parseReport(data.report);
  const context = contextView(data.context);
  return <article className={`card live-report-doc ${wide ? 'wide' : ''}`}>
    <h2>{title}</h2>
    {(parsed.sourceTime || data.createdAt || context.label) && <div className="live-report-meta">
      <span>{parsed.sourceTime || dateDisplay(data.createdAt)}</span>
      {context.label && <span className="live-report-context">{context.label}</span>}
      {context.summary && <button type="button" className="live-report-help" title={context.summary} aria-label={`${context.label} 설명`}>?</button>}
    </div>}
    {parsed.sections.length === 0
      ? <div className="live-report-raw">{data.report}</div>
      : <div className="live-report-sections">{parsed.sections.map((section, sectionIndex) => <section className={`live-report-section ${section.level >= 3 ? 'subsection' : ''} ${wide && sectionIndex === 0 ? 'featured' : ''}`} key={`${section.title}-${sectionIndex}`}>
          <h3>{section.title}</h3>
          {section.blocks.map((block, blockIndex) => <div className="live-report-block" key={blockIndex}>
            {block.heading && <h4>{block.heading}</h4>}
            {block.table && <div className="live-report-table-wrap"><table><thead><tr>{block.table.headers.map((header, index) => <th key={index}>{header}</th>)}</tr></thead><tbody>{block.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td className={tone(cell)} key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
            {block.items.map((item, itemIndex) => <p className="live-report-item" key={itemIndex}>{item}</p>)}
          </div>)}
        </section>)}</div>}
  </article>;
}
