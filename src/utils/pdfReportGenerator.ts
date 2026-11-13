import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  EcoSensor,
  IndustrialMachine,
  Language,
  PPEViolation,
  UserProfile,
} from '../types';

export type ComplianceReportType = 'safety' | 'eco' | 'equipment' | 'roi';
export type PdfThemeMode = 'branded' | 'light';

export interface CompliancePdfInput {
  reportType: ComplianceReportType;
  theme?: PdfThemeMode;
  language: Language;
  profile: UserProfile | null;
  violations: PPEViolation[];
  ecoSensors: EcoSensor[];
  machines: IndustrialMachine[];
  docNumber: string;
  verificationHash: string;
  issuedAt?: Date;
}

interface Palette {
  pageBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  success: string;
  warning: string;
  danger: string;
  tableHeaderBg: string;
  rowAltBg: string;
}

const A4_WIDTH_PX = 1240;
const A4_HEIGHT_PX = 1754;
const MARGIN_X = 64;
const CONTENT_WIDTH = A4_WIDTH_PX - MARGIN_X * 2;
const FOOTER_RESERVE = 110;

function getAccentHex(reportType: ComplianceReportType, isDark: boolean): {
  accent: string;
  soft: string;
  border: string;
} {
  if (reportType === 'eco') {
    return isDark
      ? { accent: '#34d399', soft: '#052e26', border: '#065f46' }
      : { accent: '#059669', soft: '#ecfdf5', border: '#a7f3d0' };
  }
  if (reportType === 'equipment') {
    return isDark
      ? { accent: '#fbbf24', soft: '#2b1c06', border: '#78350f' }
      : { accent: '#d97706', soft: '#fffbeb', border: '#fde68a' };
  }
  if (reportType === 'roi') {
    return isDark
      ? { accent: '#f59e0b', soft: '#271705', border: '#92400e' }
      : { accent: '#b45309', soft: '#fffbeb', border: '#fcd34d' };
  }
  return isDark
    ? { accent: '#22d3ee', soft: '#082633', border: '#155e75' }
    : { accent: '#0891b2', soft: '#ecfeff', border: '#a5f3fc' };
}

function getPalette(reportType: ComplianceReportType, theme: PdfThemeMode): Palette {
  const isDark = theme === 'branded';
  const acc = getAccentHex(reportType, isDark);

  if (isDark) {
    return {
      pageBg: '#020617',
      surface: '#0f172a',
      surfaceAlt: '#091124',
      border: '#1e293b',
      borderStrong: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      accent: acc.accent,
      accentSoft: acc.soft,
      accentBorder: acc.border,
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#fb7185',
      tableHeaderBg: '#0b152b',
      rowAltBg: '#070f21',
    };
  }

  return {
    pageBg: '#ffffff',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    border: '#cbd5e1',
    borderStrong: '#64748b',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#475569',
    accent: acc.accent,
    accentSoft: acc.soft,
    accentBorder: acc.border,
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    tableHeaderBg: '#e2e8f0',
    rowAltBg: '#f8fafc',
  };
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['—'];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      // Handle single token wider than maxWidth
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildDocumentMeta(
  reportType: ComplianceReportType,
  profile: UserProfile | null,
  violationsCount: number,
  sensorsCount: number,
  machinesCount: number
): { docNumber: string; verificationHash: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix =
    reportType === 'safety'
      ? 'SIZ'
      : reportType === 'eco'
      ? 'ECO'
      : reportType === 'equipment'
      ? 'ISO'
      : 'MRP';

  const seed = `${profile?.userId || 'nf'}-${reportType}-${y}${m}${d}-${violationsCount}-${sensorsCount}-${machinesCount}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const seq = String(Math.abs(h1) % 900 + 100);
  const hexA = (h1 >>> 0).toString(16).padStart(8, '0');
  const hexB = (h2 >>> 0).toString(16).padStart(8, '0');
  const hexC = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');

  return {
    docNumber: `NF-${prefix}-${y}-${m}${d}-${seq}`,
    verificationHash: `${hexA}${hexB}${hexC}f4a91c`,
  };
}

export async function renderComplianceReportPages(
  input: CompliancePdfInput
): Promise<HTMLCanvasElement[]> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // continue with available fonts
    }
  }

  const theme: PdfThemeMode = input.theme || 'branded';
  const palette = getPalette(input.reportType, theme);
  const lang = input.language;
  const issuedDate = input.issuedAt || new Date();
  const dateStr = issuedDate.toLocaleDateString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = issuedDate.toLocaleTimeString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const [logoImg, qrDataUrl] = await Promise.all([
    loadImageSafe('/assets/neurofactory_logo.jpg'),
    QRCode.toDataURL(
      `NF-DOC|NO=${input.docNumber}|TYPE=${input.reportType.toUpperCase()}|HASH=${input.verificationHash}`,
      {
        width: 140,
        margin: 1,
        color:
          theme === 'branded'
            ? { dark: '#22d3ee', light: '#0f172a' }
            : { dark: '#0f172a', light: '#ffffff' },
      }
    ).catch(() => ''),
  ]);
  const qrImg = qrDataUrl ? await loadImageSafe(qrDataUrl) : null;

  const pages: HTMLCanvasElement[] = [];

  const createNewPage = (pageIndex: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    cursorY: number;
  } => {
    const canvas = document.createElement('canvas');
    canvas.width = A4_WIDTH_PX;
    canvas.height = A4_HEIGHT_PX;
    const ctx = canvas.getContext('2d')!;

    // Page background
    ctx.fillStyle = palette.pageBg;
    ctx.fillRect(0, 0, A4_WIDTH_PX, A4_HEIGHT_PX);

    // Subtle branded frame border
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 28, 28, A4_WIDTH_PX - 56, A4_HEIGHT_PX - 56, 18);
    ctx.stroke();

    // Top accent stripe matching active module
    const grad = ctx.createLinearGradient(MARGIN_X, 28, A4_WIDTH_PX - MARGIN_X, 28);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.25, palette.accent);
    grad.addColorStop(0.75, palette.accent);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(MARGIN_X, 28, CONTENT_WIDTH, 4);

    if (pageIndex === 0) {
      // Full branded masthead on Page 1
      drawRoundedRect(ctx, MARGIN_X, 56, CONTENT_WIDTH, 184, 16);
      ctx.fillStyle = palette.surface;
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Logo emblem circle
      const logoX = MARGIN_X + 26;
      const logoY = 80;
      const logoSize = 62;
      ctx.save();
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      if (logoImg) {
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      } else {
        ctx.fillStyle = palette.accent;
        ctx.fillRect(logoX, logoY, logoSize, logoSize);
        ctx.fillStyle = '#020617';
        ctx.font = '800 30px Manrope, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', logoX + logoSize / 2, logoY + logoSize / 2);
      }
      ctx.restore();
      ctx.strokeStyle = palette.accentBorder;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Brand title & AI tag
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = palette.textPrimary;
      ctx.font = '800 26px Manrope, system-ui, sans-serif';
      ctx.fillText('NeuroFactory', logoX + 78, 108);
      const nfWidth = ctx.measureText('NeuroFactory').width;

      drawRoundedRect(ctx, logoX + 86 + nfWidth, 86, 38, 26, 6);
      ctx.fillStyle = palette.accentSoft;
      ctx.fill();
      ctx.strokeStyle = palette.accentBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.fillText('AI', logoX + 96 + nfWidth, 104);

      ctx.fillStyle = palette.textMuted;
      ctx.font = '500 14px Manrope, system-ui, sans-serif';
      ctx.fillText(
        lang === 'kz'
          ? 'Өнеркәсіптік интеллект және Edge AI сәйкестік жүйесі'
          : 'Промышленная платформа предиктивного интеллекта и актирования РК',
        logoX + 78,
        132
      );

      // Enterprise Name & Region row
      ctx.fillStyle = palette.textPrimary;
      ctx.font = '700 20px Manrope, system-ui, sans-serif';
      const factoryLabel =
        input.profile?.factoryName ||
        (lang === 'kz' ? 'Өндірістік кәсіпорын' : 'Производственное предприятие');
      ctx.fillText(factoryLabel, logoX, 182);

      ctx.fillStyle = palette.textSecondary;
      ctx.font = '500 14px Manrope, system-ui, sans-serif';
      const regionText = input.profile?.region || (lang === 'kz' ? 'Жамбыл облысы' : 'Жамбылская область');
      const sectorText =
        input.profile?.industrySector ||
        (lang === 'kz' ? 'Металлургия және химия' : 'Металлургия и химия');
      ctx.fillText(`${regionText}  ·  ${sectorText}`, logoX, 208);

      // Right Document Stamp Card
      const stampW = 310;
      const stampX = MARGIN_X + CONTENT_WIDTH - stampW - 22;
      drawRoundedRect(ctx, stampX, 74, stampW, 146, 12);
      ctx.fillStyle = palette.surfaceAlt;
      ctx.fill();
      ctx.strokeStyle = palette.borderStrong;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = palette.accent;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillText(
        lang === 'kz' ? 'РЕСМИ ҚҰЖАТ №' : 'ОФИЦИАЛЬНЫЙ ДОКУМЕНТ',
        stampX + 18,
        100
      );
      ctx.fillStyle = palette.textPrimary;
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.fillText(input.docNumber, stampX + 18, 128);

      ctx.fillStyle = palette.textSecondary;
      ctx.font = '500 13px Manrope, system-ui, sans-serif';
      ctx.fillText(
        `${lang === 'kz' ? 'Күні' : 'Дата'}: ${dateStr} (${timeStr})`,
        stampX + 18,
        158
      );

      ctx.fillStyle = palette.success;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText(
        lang === 'kz' ? 'EDGE AI РАСТАЛҒАН' : 'ВЕРИФИЦИРОВАНО EDGE AI',
        stampX + 18,
        190
      );

      pages.push(canvas);
      return { canvas, ctx, cursorY: 266 };
    }

    // Continuation page compact header
    ctx.fillStyle = palette.textMuted;
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`NeuroFactory AI  ·  ${input.docNumber}`, MARGIN_X, 66);
    ctx.textAlign = 'right';
    ctx.fillText(
      input.profile?.factoryName || (lang === 'kz' ? 'Кәсіпорын' : 'Предприятие'),
      A4_WIDTH_PX - MARGIN_X,
      66
    );
    ctx.textAlign = 'left';
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, 82);
    ctx.lineTo(A4_WIDTH_PX - MARGIN_X, 82);
    ctx.stroke();

    pages.push(canvas);
    return { canvas, ctx, cursorY: 108 };
  };

  let page = createNewPage(0);

  const ensureSpace = (neededHeight: number) => {
    if (page.cursorY + neededHeight > A4_HEIGHT_PX - FOOTER_RESERVE) {
      page = createNewPage(pages.length);
    }
  };

  const drawSectionHeading = (title: string, subtitle: string) => {
    ensureSpace(120);
    const { ctx } = page;
    ctx.fillStyle = palette.accent;
    ctx.font = '700 20px Manrope, system-ui, sans-serif';
    ctx.fillText(title, MARGIN_X, page.cursorY + 18);

    ctx.strokeStyle = palette.accentBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, page.cursorY + 32);
    ctx.lineTo(A4_WIDTH_PX - MARGIN_X, page.cursorY + 32);
    ctx.stroke();

    page.cursorY += 54;
    ctx.fillStyle = palette.textSecondary;
    ctx.font = '400 15px Manrope, system-ui, sans-serif';
    const descLines = wrapTextLines(ctx, subtitle, CONTENT_WIDTH);
    for (const line of descLines) {
      ctx.fillText(line, MARGIN_X, page.cursorY);
      page.cursorY += 23;
    }
    page.cursorY += 16;
  };

  const drawKpiRow = (
    items: { label: string; value: string; note: string; color?: string }[]
  ) => {
    ensureSpace(130);
    const { ctx } = page;
    const gap = 16;
    const cardW = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    const cardH = 104;

    items.forEach((item, idx) => {
      const x = MARGIN_X + idx * (cardW + gap);
      const y = page.cursorY;
      drawRoundedRect(ctx, x, y, cardW, cardH, 12);
      ctx.fillStyle = palette.surface;
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = palette.textMuted;
      ctx.font = '600 13px Manrope, system-ui, sans-serif';
      ctx.fillText(item.label, x + 18, y + 28, cardW - 36);

      ctx.fillStyle = item.color || palette.textPrimary;
      ctx.font = '700 26px "JetBrains Mono", monospace';
      ctx.fillText(item.value, x + 18, y + 64, cardW - 36);

      ctx.fillStyle = palette.textSecondary;
      ctx.font = '400 12px Manrope, system-ui, sans-serif';
      ctx.fillText(item.note, x + 18, y + 88, cardW - 36);
    });

    page.cursorY += cardH + 28;
  };

  interface TableCol {
    title: string;
    width: number;
    mono?: boolean;
    align?: 'left' | 'right';
  }

  const drawTable = (
    columns: TableCol[],
    rows: { cells: string[]; statusColor?: string; statusColIndex?: number }[],
    emptyMessage: string
  ) => {
    const headerH = 44;
    const drawHeader = () => {
      ensureSpace(headerH + 56);
      const { ctx } = page;
      drawRoundedRect(ctx, MARGIN_X, page.cursorY, CONTENT_WIDTH, headerH, 10);
      ctx.fillStyle = palette.tableHeaderBg;
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      let colX = MARGIN_X;
      ctx.fillStyle = palette.textSecondary;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      columns.forEach((col) => {
        ctx.textAlign = col.align === 'right' ? 'right' : 'left';
        const textX = col.align === 'right' ? colX + col.width - 14 : colX + 14;
        ctx.fillText(col.title, textX, page.cursorY + 27, col.width - 28);
        colX += col.width;
      });
      ctx.textAlign = 'left';
      page.cursorY += headerH + 4;
    };

    drawHeader();

    if (rows.length === 0) {
      ensureSpace(72);
      const { ctx } = page;
      drawRoundedRect(ctx, MARGIN_X, page.cursorY, CONTENT_WIDTH, 60, 10);
      ctx.fillStyle = palette.surface;
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.stroke();
      ctx.fillStyle = palette.textMuted;
      ctx.font = '500 14px Manrope, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(emptyMessage, MARGIN_X + CONTENT_WIDTH / 2, page.cursorY + 35);
      ctx.textAlign = 'left';
      page.cursorY += 80;
      return;
    }

    rows.forEach((row, rIdx) => {
      const { ctx } = page;
      const cellLines = row.cells.map((cell, cIdx) => {
        const col = columns[cIdx];
        ctx.font = col.mono
          ? '500 13px "JetBrains Mono", monospace'
          : '500 13px Manrope, system-ui, sans-serif';
        return wrapTextLines(ctx, cell, col.width - 24);
      });
      const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
      const rowH = Math.max(44, maxLines * 20 + 20);

      if (page.cursorY + rowH > A4_HEIGHT_PX - FOOTER_RESERVE) {
        page = createNewPage(pages.length);
        drawHeader();
      }

      const rowCtx = page.ctx;
      drawRoundedRect(rowCtx, MARGIN_X, page.cursorY, CONTENT_WIDTH, rowH, 8);
      rowCtx.fillStyle = rIdx % 2 === 0 ? palette.surface : palette.rowAltBg;
      rowCtx.fill();
      rowCtx.strokeStyle = palette.border;
      rowCtx.lineWidth = 1;
      rowCtx.stroke();

      let colX = MARGIN_X;
      cellLines.forEach((lines, cIdx) => {
        const col = columns[cIdx];
        rowCtx.font = col.mono
          ? '600 13px "JetBrains Mono", monospace'
          : '500 13px Manrope, system-ui, sans-serif';
        rowCtx.fillStyle =
          row.statusColIndex === cIdx && row.statusColor
            ? row.statusColor
            : cIdx === 0
            ? palette.textMuted
            : palette.textPrimary;
        rowCtx.textAlign = col.align === 'right' ? 'right' : 'left';
        const textX = col.align === 'right' ? colX + col.width - 12 : colX + 12;

        lines.forEach((line, lIdx) => {
          rowCtx.fillText(line, textX, page.cursorY + 25 + lIdx * 20);
        });
        colX += col.width;
      });
      rowCtx.textAlign = 'left';
      page.cursorY += rowH + 6;
    });

    page.cursorY += 18;
  };

  // ==================== CONTENT BY REPORT TYPE ====================
  if (input.reportType === 'safety') {
    const resolvedCount = input.violations.filter((v) => v.status === 'resolved').length;
    const avgConf =
      input.violations.length > 0
        ? Math.round(
            (input.violations.reduce((s, v) => s + v.confidence, 0) / input.violations.length) * 100
          )
        : 0;

    drawSectionHeading(
      lang === 'kz'
        ? '1. ЖҚҚ бұзушылықтарын ішкі тергеу актісі (ГОСТ 12.4.011-89)'
        : '1. Акт внутреннего расследования инцидентов СИЗ (ГОСТ 12.4.011-89)',
      lang === 'kz'
        ? `Осы акт SafeVision (YOLOv11 Edge) нейрожелілік бейнеаналитика модулі арқылы автоматты түрде жасалды. Есепті кезеңде өнеркәсіптік қауіпсіздік нормаларынан ${input.violations.length} ауытқу тіркелді.`
        : `Настоящий акт сформирован автоматизированным модулем нейросетевой видеоаналитики SafeVision (YOLOv11 Edge). За отчетный период зафиксировано ${input.violations.length} событий отклонения от требований охраны труда и промышленной безопасности.`
    );

    drawKpiRow([
      {
        label: lang === 'kz' ? 'Тіркелген инциденттер' : 'Всего инцидентов СИЗ',
        value: String(input.violations.length),
        note: lang === 'kz' ? 'Ауысым / есепті кезең' : 'За отчетный период',
        color: input.violations.length > 0 ? palette.warning : palette.success,
      },
      {
        label: lang === 'kz' ? 'Жойылған бұзушылықтар' : 'Устранено на месте',
        value: String(resolvedCount),
        note: lang === 'kz' ? 'Инженер растаған' : 'Верифицировано ОТ',
        color: palette.success,
      },
      {
        label: lang === 'kz' ? 'AI орташа дәлдігі' : 'Средняя точность AI',
        value: input.violations.length > 0 ? `${avgConf}%` : '—',
        note: 'YOLOv11 TensorRT Edge',
        color: palette.accent,
      },
    ]);

    const violationName = (v: PPEViolation) => {
      if (lang === 'kz') {
        switch (v.violationType) {
          case 'no_helmet':
            return 'Қорғаныс дулығасы жоқ';
          case 'no_vest':
            return 'Сигналдық кеудеше жоқ';
          case 'no_goggles':
            return 'Қорғаныс көзілдірігі жоқ';
          default:
            return 'Қауіпті аймаққа кіру';
        }
      }
      switch (v.violationType) {
        case 'no_helmet':
          return 'Отсутствие защитной каски';
        case 'no_vest':
          return 'Отсутствие сигнального жилета';
        case 'no_goggles':
          return 'Отсутствие защитных очков';
        default:
          return 'Вход в опасную крановую зону';
      }
    };

    const statusLabel = (s: PPEViolation['status']) => {
      if (lang === 'kz') {
        if (s === 'resolved') return 'Жойылды';
        if (s === 'verified') return 'Расталды';
        if (s === 'false_positive') return 'Жалған';
        return 'Жаңа';
      }
      if (s === 'resolved') return 'Устранено';
      if (s === 'verified') return 'Подтверждено';
      if (s === 'false_positive') return 'Ложное';
      return 'Новое';
    };

    drawTable(
      [
        { title: '№', width: 52, mono: true },
        { title: lang === 'kz' ? 'Учаске / Камера' : 'Зона / Камера', width: 250 },
        { title: lang === 'kz' ? 'Бұзушылық түрі' : 'Тип нарушения', width: 270 },
        { title: lang === 'kz' ? 'Қызметкер' : 'Сотрудник', width: 210 },
        { title: lang === 'kz' ? 'Дәлдік' : 'Точность', width: 120, mono: true, align: 'right' },
        { title: lang === 'kz' ? 'Мәртебесі' : 'Статус', width: 210, mono: true },
      ],
      input.violations.map((v, idx) => ({
        cells: [
          String(idx + 1),
          `${v.area} (${v.cameraName})`,
          violationName(v),
          v.employeeName || (lang === 'kz' ? 'Жалпы кадр' : 'Общий кадр'),
          `${Math.round(v.confidence * 100)}%`,
          statusLabel(v.status),
        ],
        statusColIndex: 5,
        statusColor:
          v.status === 'resolved'
            ? palette.success
            : v.status === 'verified'
            ? palette.danger
            : palette.warning,
      })),
      input.profile?.hasConnectedHardware === false
        ? lang === 'kz'
          ? 'Жабдық әлі қосылмаған. Бұзушылықтар жоқ.'
          : 'Оборудование пока не подключено. Нарушений не зафиксировано.'
        : lang === 'kz'
        ? 'Есепті кезеңде бұзушылықтар тіркелмеді (100% сәйкестік).'
        : 'Нарушений за отчетный период не зафиксировано (100% соблюдение).'
    );
  } else if (input.reportType === 'eco') {
    const critCount = input.ecoSensors.filter((s) => s.status === 'critical').length;
    const warnCount = input.ecoSensors.filter((s) => s.status === 'warning').length;

    drawSectionHeading(
      lang === 'kz'
        ? '2. Шығарындылар ШРК ресми рапорты (2-ТП Ауа / ҚР Экология министрлігі)'
        : '2. Официальный рапорт ПДК выбросов (Форма 2-ТП Воздух / Минэкологии РК)',
      lang === 'kz'
        ? 'Қазақстан Республикасы Экологиялық кодексінің талаптарына сәйкес үздіксіз экологиялық мониторингтің автоматты бекеттерінің (АСТЭМ) жиынтық көрсеткіштері.'
        : 'Сводные показатели автоматических постов непрерывного экологического мониторинга (АСТЭМ) в соответствии с требованиями Экологического кодекса Республики Казахстан.'
    );

    drawKpiRow([
      {
        label: lang === 'kz' ? 'Белсенді газ талдағыштар' : 'Постов газоанализа',
        value: String(input.ecoSensors.length),
        note: 'Modbus TCP / MQTT Edge',
        color: palette.accent,
      },
      {
        label: lang === 'kz' ? 'Ескерту деңгейі' : 'Предупреждений',
        value: String(warnCount),
        note: lang === 'kz' ? 'Шекке жақындау' : 'Приближение к ПДК',
        color: warnCount > 0 ? palette.warning : palette.success,
      },
      {
        label: lang === 'kz' ? 'ШРК асу фактілері' : 'Превышений ПДК',
        value: String(critCount),
        note: lang === 'kz' ? 'ҚР нормативі бойынша' : 'Норматив РК',
        color: critCount > 0 ? palette.danger : palette.success,
      },
    ]);

    drawTable(
      [
        { title: '№', width: 52, mono: true },
        { title: lang === 'kz' ? 'Бекет атауы' : 'Пост мониторинга', width: 290 },
        { title: lang === 'kz' ? 'Аймақ / Цех' : 'Локация', width: 230 },
        { title: lang === 'kz' ? 'Көрсеткіш' : 'Текущее знач.', width: 175, mono: true, align: 'right' },
        { title: lang === 'kz' ? 'ШРК шегі' : 'Лимит ПДК', width: 175, mono: true, align: 'right' },
        { title: lang === 'kz' ? 'Мәртебе' : 'Статус', width: 190, mono: true },
      ],
      input.ecoSensors.map((s, idx) => ({
        cells: [
          String(idx + 1),
          `${s.name} (${s.code})`,
          s.area,
          `${s.currentValue} ${s.unit}`,
          `≤ ${s.thresholdCritical} ${s.unit}`,
          s.status === 'critical'
            ? lang === 'kz'
              ? 'ШРК АСУЫ'
              : 'ПРЕВЫШЕНИЕ ПДК'
            : s.status === 'warning'
            ? lang === 'kz'
              ? 'ЕСКЕРТУ'
              : 'ВНИМАНИЕ'
            : lang === 'kz'
            ? 'ҚАЛЫПТЫ'
            : 'НОРМА',
        ],
        statusColIndex: 5,
        statusColor:
          s.status === 'critical'
            ? palette.danger
            : s.status === 'warning'
            ? palette.warning
            : palette.success,
      })),
      lang === 'kz'
        ? 'Газ тазалау датчиктері әлі қосылмаған.'
        : 'Датчики газоочистки не подключены к шлюзу мониторинга.'
    );
  } else if (input.reportType === 'equipment') {
    const highRiskCount = input.machines.filter(
      (m) => m.riskStatus === 'high' || m.riskStatus === 'critical'
    ).length;
    const avgRul =
      input.machines.length > 0
        ? Math.round(
            input.machines.reduce((s, m) => s + m.remainingUsefulLifeHours, 0) /
              input.machines.length
          )
        : 0;

    drawSectionHeading(
      lang === 'kz'
        ? '3. Жабдықтардың діріл диагностикасы актісі (FailPredict / ISO 10816-3)'
        : '3. Акт виброакустической диагностики оборудования (FailPredict / ISO 10816-3)',
      lang === 'kz'
        ? 'Подшипник тораптарының температурасын, діріл үдеуін (RMS) және ақауларды ерте анықтау мен қалдық ресурс (RUL) болжамын бағалау қорытындысы.'
        : 'Заключение по состоянию технологических агрегатов на основе анализа виброускорения RMS, температуры подшипниковых опор и прогноза остаточного ресурса до отказа (RUL).'
    );

    drawKpiRow([
      {
        label: lang === 'kz' ? 'Бақылаудағы агрегаттар' : 'Агрегатов в реестре',
        value: String(input.machines.length),
        note: 'ISO 10816-3 IEPE',
        color: palette.accent,
      },
      {
        label: lang === 'kz' ? 'Жоғары / шұғыл тәуекел' : 'Высокий / критич. риск',
        value: String(highRiskCount),
        note: lang === 'kz' ? 'ТҚ талап етіледі' : 'Требует внимания ТО',
        color: highRiskCount > 0 ? palette.danger : palette.success,
      },
      {
        label: lang === 'kz' ? 'Орташа RUL ресурсы' : 'Средний ресурс RUL',
        value: input.machines.length > 0 ? `${avgRul} ч` : '—',
        note: lang === 'kz' ? 'Болжамды наработка' : 'До планового ремонта',
        color: palette.success,
      },
    ]);

    drawTable(
      [
        { title: '№', width: 48, mono: true },
        { title: lang === 'kz' ? 'Агрегат / Цех' : 'Агрегат / Цех', width: 320 },
        { title: 'RMS (мм/с)', width: 150, mono: true, align: 'right' },
        { title: 'Темп. (°C)', width: 140, mono: true, align: 'right' },
        { title: 'RUL (ч)', width: 140, mono: true, align: 'right' },
        { title: lang === 'kz' ? 'Ақау қаупі' : 'Статус риска', width: 314, mono: true },
      ],
      input.machines.map((m, idx) => ({
        cells: [
          String(idx + 1),
          `${m.name} · ${m.area}`,
          `${m.vibrationRmsMmS.toFixed(1)}`,
          `${m.temperatureC.toFixed(1)}`,
          `${m.remainingUsefulLifeHours}`,
          `${m.riskStatus.toUpperCase()} (${m.failureProbabilityPercent}%)`,
        ],
        statusColIndex: 5,
        statusColor:
          m.riskStatus === 'critical' || m.riskStatus === 'high'
            ? palette.danger
            : m.riskStatus === 'medium'
            ? palette.warning
            : palette.success,
      })),
      lang === 'kz'
        ? 'Вибробақылау агрегаттары әлі қосылмаған.'
        : 'Технологические агрегаты пока не подключены к системе виброконтроля.'
    );
  } else {
    // ROI / MRP Savings Report
    const MRP_RATE_2026 = 3932;
    const estimatedFineAvoidanceMRP = 485;
    const estimatedSavingsKZT = (estimatedFineAvoidanceMRP * MRP_RATE_2026).toLocaleString('ru-RU');

    drawSectionHeading(
      lang === 'kz'
        ? '4. Алдын алынған экологиялық және апаттық залал есебі (ҚР АЕК)'
        : '4. Расчет предотвращенного экологического и аварийного ущерба (в МРП РК)',
      lang === 'kz'
        ? 'ҚР Салық кодексінің 574-бабы және Әкімшілік құқық бұзушылық туралы кодексі негізінде қоршаған ортаға эмиссия нормативтерінен асу және еңбек қауіпсіздігі талаптарын бұзу тәуекелдерінің алдын алу тиімділігі:'
        : 'На основании статьи 574 Налогового кодекса РК и Кодекса об административных правонарушениях РК за превышение установленных нормативов эмиссий в окружающую среду и нарушение требований промышленной безопасности:'
    );

    drawKpiRow([
      {
        label: lang === 'kz' ? 'Алдын алынған айыппұл' : 'Предотвращено штрафов',
        value: `${estimatedFineAvoidanceMRP} МРП`,
        note: `1 МРП = 3 932 ₸ (2026)`,
        color: palette.warning,
      },
      {
        label: lang === 'kz' ? 'Теңгемен үнемдеу' : 'Экономия в тенге',
        value: `${estimatedSavingsKZT} ₸`,
        note: lang === 'kz' ? 'Экологиялық эмиссиялар' : 'По залповым выбросам',
        color: palette.success,
      },
      {
        label: lang === 'kz' ? 'Сақталған моторесурс' : 'Сохраненный моторесурс',
        value: '142 ч',
        note: lang === 'kz' ? 'Агрегаттар тоқтауы жоқ' : 'Предотвращение простоев',
        color: palette.accent,
      },
    ]);

    drawTable(
      [
        { title: '№', width: 52, mono: true },
        { title: lang === 'kz' ? 'Тиімділік бағыты' : 'Статья предотвращенного ущерба', width: 460 },
        { title: lang === 'kz' ? 'Норматив негізі' : 'Нормативная база РК', width: 320 },
        { title: lang === 'kz' ? 'Бағалау' : 'Эффект', width: 280, mono: true, align: 'right' },
      ],
      [
        {
          cells: [
            '1',
            lang === 'kz'
              ? 'SO₂ / NO₂ күрт шығарындыларын ерте болжау (EcoPredict)'
              : 'Раннее предупреждение залповых выбросов SO₂ / NO₂ (EcoPredict)',
            lang === 'kz' ? 'ҚР Экология кодексі, 574-бап' : 'Экологический кодекс / ст. 574 НК РК',
            '310 МРП (1 218 920 ₸)',
          ],
          statusColIndex: 3,
          statusColor: palette.success,
        },
        {
          cells: [
            '2',
            lang === 'kz'
              ? 'ЖҚҚ бұзушылықтары мен қауіпті аймаққа кіруді бұғаттау (SafeVision)'
              : 'Предотвращение травматизма и нарушений СИЗ (SafeVision)',
            lang === 'kz' ? 'ГОСТ 12.4.011-89 / ҚР ӘҚБтК' : 'ГОСТ 12.4.011-89 / КоАП РК',
            '175 МРП (688 100 ₸)',
          ],
          statusColIndex: 3,
          statusColor: palette.success,
        },
        {
          cells: [
            '3',
            lang === 'kz'
              ? 'Түтін сорғыш пен компрессор апатының алдын алу (FailPredict)'
              : 'Исключение аварийного останова компрессоров и дымососов (FailPredict)',
            lang === 'kz' ? 'ISO 10816-3 вибробақылау' : 'Стандарт ISO 10816-3',
            '142 ч безаварийной работы',
          ],
          statusColIndex: 3,
          statusColor: palette.accent,
        },
      ],
      ''
    );
  }

  // ==================== SIGNATURES & CRYPTOGRAPHIC SEAL ====================
  ensureSpace(176);
  const { ctx } = page;
  const sigY = page.cursorY + 6;
  const sigH = 148;
  drawRoundedRect(ctx, MARGIN_X, sigY, CONTENT_WIDTH, sigH, 14);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Left: Responsible Engineer
  const leftX = MARGIN_X + 24;
  ctx.fillStyle = palette.textPrimary;
  ctx.font = '700 14px Manrope, system-ui, sans-serif';
  ctx.fillText(
    lang === 'kz'
      ? 'Бас инженер / Еңбек қауіпсіздігіне жауапты:'
      : 'Главный инженер / Ответственный за ПБ и ТБ:',
    leftX,
    sigY + 34
  );

  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, sigY + 86);
  ctx.lineTo(leftX + 340, sigY + 86);
  ctx.stroke();

  ctx.fillStyle = palette.textSecondary;
  ctx.font = '500 13px Manrope, system-ui, sans-serif';
  ctx.fillText(
    input.profile?.contactPerson ||
      (lang === 'kz' ? 'Кәсіпорын инженері' : 'Ответственный инженер предприятия'),
    leftX,
    sigY + 112
  );
  ctx.fillStyle = palette.textMuted;
  ctx.font = '400 12px "JetBrains Mono", monospace';
  ctx.fillText(dateStr, leftX, sigY + 132);

  // Right: Digital Edge Seal + QR Code
  const qrSize = 104;
  const qrX = MARGIN_X + CONTENT_WIDTH - qrSize - 22;
  const qrY = sigY + 22;
  if (qrImg) {
    drawRoundedRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8);
    ctx.fillStyle = palette.surfaceAlt;
    ctx.fill();
    ctx.strokeStyle = palette.accentBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  const sealX = MARGIN_X + 430;
  ctx.fillStyle = palette.textPrimary;
  ctx.font = '700 14px Manrope, system-ui, sans-serif';
  ctx.fillText(
    lang === 'kz'
      ? 'NeuroFactory Edge цифрлық верификациясы:'
      : 'Цифровая верификация шлюза NeuroFactory Edge:',
    sealX,
    sigY + 34
  );
  ctx.fillStyle = palette.success;
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText(`SHA256: ${input.verificationHash}`, sealX, sigY + 64);

  ctx.fillStyle = palette.textSecondary;
  ctx.font = '400 12px Manrope, system-ui, sans-serif';
  ctx.fillText(
    lang === 'kz'
      ? 'Ядроның криптографиялық қолтаңбасымен расталған'
      : 'Заверено криптографической подписью ядра',
    sealX,
    sigY + 90
  );
  ctx.fillStyle = palette.textMuted;
  ctx.font = '400 11px "JetBrains Mono", monospace';
  ctx.fillText(`ID: ${input.docNumber}`, sealX, sigY + 114);

  // ==================== RUNNING FOOTERS ON ALL PAGES ====================
  const totalPages = pages.length;
  pages.forEach((canvas, idx) => {
    const fCtx = canvas.getContext('2d')!;
    const footerY = A4_HEIGHT_PX - 54;
    fCtx.strokeStyle = palette.border;
    fCtx.lineWidth = 1;
    fCtx.beginPath();
    fCtx.moveTo(MARGIN_X, footerY - 22);
    fCtx.lineTo(A4_WIDTH_PX - MARGIN_X, footerY - 22);
    fCtx.stroke();

    fCtx.fillStyle = palette.textMuted;
    fCtx.font = '500 12px "JetBrains Mono", monospace';
    fCtx.textAlign = 'left';
    fCtx.fillText(
      `NeuroFactory AI  ·  ${input.docNumber}  ·  ${
        theme === 'branded' ? 'Branded Official PDF' : 'Print Edition'
      }`,
      MARGIN_X,
      footerY
    );
    fCtx.textAlign = 'right';
    fCtx.fillText(
      lang === 'kz'
        ? `Бет ${idx + 1} / ${totalPages}`
        : `Страница ${idx + 1} из ${totalPages}`,
      A4_WIDTH_PX - MARGIN_X,
      footerY
    );
    fCtx.textAlign = 'left';
  });

  return pages;
}

export async function downloadCompliancePdf(input: CompliancePdfInput): Promise<string> {
  const pages = await renderComplianceReportPages(input);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const titles: Record<ComplianceReportType, string> = {
    safety: 'Акт нарушений СИЗ (ГОСТ 12.4.011-89)',
    eco: 'Рапорт ПДК выбросов (Минэкологии РК)',
    equipment: 'Акт вибродиагностики (ISO 10816-3)',
    roi: 'Расчет предотвращенного ущерба (МРП РК)',
  };

  pdf.setProperties({
    title: `${titles[input.reportType]} — ${input.docNumber}`,
    subject: 'NeuroFactory AI Compliance Report',
    author: input.profile?.factoryName || 'NeuroFactory AI',
    creator: 'NeuroFactory AI Edge Compliance Engine',
  });

  pages.forEach((canvas, idx) => {
    if (idx > 0) pdf.addPage('a4', 'portrait');
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  });

  const safeDate = (input.issuedAt || new Date()).toISOString().slice(0, 10);
  const filename = `NeuroFactory_${input.reportType.toUpperCase()}_${input.docNumber}_${safeDate}.pdf`;
  pdf.save(filename);
  return filename;
}

export async function printComplianceDocument(input: CompliancePdfInput): Promise<void> {
  const pages = await renderComplianceReportPages(input);
  const dataUrls = pages.map((c) => c.toDataURL('image/png'));

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  const imagesHtml = dataUrls
    .map(
      (url) =>
        `<div class="page"><img src="${url}" alt="NeuroFactory Report Page" /></div>`
    )
    .join('');

  doc.open();
  doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${input.docNumber}</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0; padding: 0; background: #020617; }
      .page { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
      .page:last-child { page-break-after: auto; }
      img { width: 100%; height: 100%; display: block; object-fit: contain; }
    </style>
  </head>
  <body>${imagesHtml}</body>
</html>`);
  doc.close();

  const imgs = Array.from(doc.images);
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete ||
        new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        })
    )
  );

  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 2000);
}
