import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import { Language, UserProfile, PPEViolation, EcoSensor, IndustrialMachine } from '../types';
import { translations } from '../i18n/translations';
import { playPingSound } from '../utils/industrialAudio';
import {
  buildDocumentMeta,
  ComplianceReportType,
  downloadCompliancePdf,
  PdfThemeMode,
  printComplianceDocument,
} from '../utils/pdfReportGenerator';
import {
  X,
  Printer,
  FileText,
  ShieldCheck,
  Leaf,
  CheckCircle2,
  MapPin,
  Award,
  Download,
  Activity,
  Loader2,
  Palette,
  AlertTriangle,
} from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';

interface ComplianceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  profile: UserProfile | null;
  violations: PPEViolation[];
  ecoSensors: EcoSensor[];
  machines: IndustrialMachine[];
}

export const ComplianceReportModal: React.FC<ComplianceReportModalProps> = ({
  isOpen,
  onClose,
  language,
  profile,
  violations,
  ecoSensors,
  machines,
}) => {
  const t = translations[language];
  const [reportType, setReportType] = useState<ComplianceReportType>('safety');
  const [pdfTheme, setPdfTheme] = useState<PdfThemeMode>('branded');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [qrSealUrl, setQrSealUrl] = useState<string>('');

  const { docNumber, verificationHash } = useMemo(
    () =>
      buildDocumentMeta(
        reportType,
        profile,
        violations.length,
        ecoSensors.length,
        machines.length
      ),
    [reportType, profile, violations.length, ecoSensors.length, machines.length]
  );

  useEffect(() => {
    if (!isOpen) {
      setDownloadNotice(null);
      setPdfError(null);
      return;
    }
    let mounted = true;
    QRCode.toDataURL(
      `NF-DOC|NO=${docNumber}|TYPE=${reportType.toUpperCase()}|HASH=${verificationHash}`,
      {
        width: 112,
        margin: 1,
        color:
          pdfTheme === 'branded'
            ? { dark: '#22d3ee', light: '#0f172a' }
            : { dark: '#0f172a', light: '#ffffff' },
      }
    )
      .then((url) => {
        if (mounted) setQrSealUrl(url);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen, docNumber, reportType, verificationHash, pdfTheme]);

  if (!isOpen) return null;

  // Kazakhstan 2026 Monthly Calculation Index (1 МРП = 3 932 тенге)
  const MRP_RATE_2026 = 3932;
  const estimatedFineAvoidanceMRP = 485;
  const estimatedSavingsKZT = (estimatedFineAvoidanceMRP * MRP_RATE_2026).toLocaleString('ru-RU');

  const issuedAt = new Date();
  const todayStr = issuedAt.toLocaleDateString(language === 'kz' ? 'kk-KZ' : 'ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPdfError(null);
    setDownloadNotice(null);
    playPingSound();

    try {
      const filename = await downloadCompliancePdf({
        reportType,
        theme: pdfTheme,
        language,
        profile,
        violations,
        ecoSensors,
        machines,
        docNumber,
        verificationHash,
        issuedAt,
      });
      setDownloadNotice(
        language === 'kz'
          ? `PDF құжаты жүктелді: ${filename}`
          : `PDF-документ сформирован и скачан: ${filename}`
      );
    } catch {
      setPdfError(
        language === 'kz'
          ? 'PDF құжатын жасау кезінде қате шықты. Қайталап көріңіз.'
          : 'Не удалось сформировать PDF-файл. Попробуйте ещё раз.'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    setPdfError(null);
    playPingSound();
    try {
      await printComplianceDocument({
        reportType,
        theme: pdfTheme,
        language,
        profile,
        violations,
        ecoSensors,
        machines,
        docNumber,
        verificationHash,
        issuedAt,
      });
    } catch {
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const isBranded = pdfTheme === 'branded';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-4xl my-auto max-h-[94dvh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Top accent hairline */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={t.common.close}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-6 no-scrollbar">
          {/* Modal Header & Controls */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pr-8">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-cyan-400">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>
                    {language === 'kz'
                      ? 'ҚР ресми актілері мен PDF есептер генераторы'
                      : 'Генератор официальных актов и PDF-отчетов РК'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {language === 'kz'
                    ? 'Өндірістік қауіпсіздік, экология және жабдықтар есебі'
                    : 'Промышленные акты и отчеты NeuroFactory AI'}
                </h2>
                <p className="text-xs text-slate-400">
                  {language === 'kz'
                    ? 'Фирмалық безендірумен дайын A4 PDF құжатын қалыптастыру және жүктеу'
                    : 'Экспорт готовых A4 PDF-документов с фирменным оформлением, таблицами и QR-верификацией'}
                </p>
              </div>

              {/* PDF Style Switcher */}
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs self-start shrink-0">
                <Palette className="h-3.5 w-3.5 text-cyan-400 ml-2 mr-1 shrink-0" />
                <button
                  type="button"
                  onClick={() => setPdfTheme('branded')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    pdfTheme === 'branded'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {language === 'kz' ? 'Фирмалық стиль' : 'Фирменный стиль'}
                </button>
                <button
                  type="button"
                  onClick={() => setPdfTheme('light')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    pdfTheme === 'light'
                      ? 'bg-slate-200 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {language === 'kz' ? 'Ақ бланк' : 'Светлый бланк'}
                </button>
              </div>
            </div>

            {/* Report Type Tabs */}
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setReportType('safety')}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  reportType === 'safety'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  {language === 'kz' ? 'ЖҚҚ актісі (ГОСТ)' : 'Акт нарушений СИЗ (ГОСТ)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('eco')}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  reportType === 'eco'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Leaf className="h-4 w-4 shrink-0" />
                <span>
                  {language === 'kz' ? 'ШРК рапорты (2-ТП)' : 'Рапорт ПДК (Минэкологии РК)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('equipment')}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  reportType === 'equipment'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Activity className="h-4 w-4 shrink-0" />
                <span>
                  {language === 'kz' ? 'Діріл актісі (ISO 10816)' : 'Акт диагностики (ISO 10816)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('roi')}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  reportType === 'roi'
                    ? 'bg-amber-700 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Award className="h-4 w-4 shrink-0" />
                <span>
                  {language === 'kz' ? 'АЕК үнемдеу есебі' : 'Расчет экономии в МРП'}
                </span>
              </button>
            </div>
          </div>

          {/* Branded Document Preview Sheet */}
          <div
            className={`relative rounded-xl border overflow-hidden shadow-inner font-sans transition-colors ${
              isBranded
                ? 'border-slate-800 bg-slate-950 text-slate-100'
                : 'border-slate-300 bg-white text-slate-900'
            }`}
          >
            {/* Top Module Accent Bar */}
            <div
              className={`h-1 w-full ${
                reportType === 'eco'
                  ? 'bg-emerald-500'
                  : reportType === 'equipment' || reportType === 'roi'
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
            />

            <div className="p-6 sm:p-8 space-y-6">
              {/* Document Header Masthead */}
              <div
                className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isBranded
                    ? 'border-slate-800 bg-slate-900/90'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="space-y-2">
                  <div className={isBranded ? '' : 'brightness-90'}>
                    <CompanyLogo
                      size="sm"
                      withText={true}
                      glow={false}
                      subtitle={
                        language === 'kz'
                          ? 'Edge AI сәйкестік жүйесі'
                          : 'Промышленный контроль и актирование РК'
                      }
                    />
                  </div>
                  <div
                    className={`text-lg font-bold tracking-tight ${
                      isBranded ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {profile?.factoryName ||
                      (language === 'kz' ? 'Өндірістік кәсіпорын' : 'Производственное предприятие')}
                  </div>
                  <div
                    className={`text-xs flex flex-wrap items-center gap-2 ${
                      isBranded ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>{profile?.region || 'Жамбылская область'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{profile?.industrySector || 'Металлургия и химия'}</span>
                  </div>
                </div>

                <div
                  className={`rounded-lg border px-4 py-3 text-xs font-mono shrink-0 space-y-1 ${
                    isBranded
                      ? 'border-slate-800 bg-slate-950 text-slate-300'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div
                    className={`font-bold ${
                      isBranded ? 'text-cyan-400' : 'text-cyan-700'
                    }`}
                  >
                    {docNumber}
                  </div>
                  <div>
                    {language === 'kz' ? 'Күні:' : 'Дата:'} {todayStr}
                  </div>
                  <div
                    className={`text-[11px] font-semibold ${
                      isBranded ? 'text-emerald-400' : 'text-emerald-700'
                    }`}
                  >
                    {language === 'kz' ? 'EDGE AI РАСТАЛҒАН' : 'ВЕРИФИЦИРОВАНО EDGE AI'}
                  </div>
                </div>
              </div>

              {/* Safety Report Preview */}
              {reportType === 'safety' && (
                <div className="space-y-4 text-xs">
                  <div
                    className={`font-bold text-sm border-b pb-2 ${
                      isBranded
                        ? 'text-cyan-300 border-slate-800'
                        : 'text-cyan-800 border-slate-200'
                    }`}
                  >
                    {language === 'kz'
                      ? '1. ЖҚҚ бұзушылықтарын ішкі тергеу актісі (ГОСТ 12.4.011-89)'
                      : '1. Акт внутреннего расследования инцидентов СИЗ (ГОСТ 12.4.011-89)'}
                  </div>
                  <p className={isBranded ? 'text-slate-300 leading-relaxed' : 'text-slate-700 leading-relaxed'}>
                    {language === 'kz'
                      ? `Осы акт SafeVision (YOLOv11 Edge) нейрожелілік бейнеаналитика модулімен жасалды. Есепті кезеңде ${violations.length} оқиға тіркелді.`
                      : `Настоящий акт составлен автоматизированным модулем нейросетевой видеоаналитики SafeVision (YOLOv11 Edge). За отчетный период зафиксировано ${violations.length} событий отклонения от норм промышленной безопасности.`}
                  </p>

                  <div className="overflow-x-auto">
                    <table
                      className={`w-full text-left border rounded-lg overflow-hidden ${
                        isBranded ? 'border-slate-800' : 'border-slate-300'
                      }`}
                    >
                      <thead
                        className={`text-[11px] font-mono ${
                          isBranded
                            ? 'bg-slate-900 text-slate-300'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5 border-b border-r border-inherit">№</th>
                          <th className="p-2.5 border-b border-r border-inherit">
                            {language === 'kz' ? 'Аймақ / Камера' : 'Зона / Камера'}
                          </th>
                          <th className="p-2.5 border-b border-r border-inherit">
                            {language === 'kz' ? 'Бұзушылық түрі' : 'Тип нарушения'}
                          </th>
                          <th className="p-2.5 border-b border-r border-inherit">
                            {language === 'kz' ? 'Дәлдік AI' : 'Точность AI'}
                          </th>
                          <th className="p-2.5 border-b border-inherit">
                            {language === 'kz' ? 'Мәртебе' : 'Статус'}
                          </th>
                        </tr>
                      </thead>
                      <tbody
                        className={`divide-y text-[11px] ${
                          isBranded ? 'divide-slate-800' : 'divide-slate-200'
                        }`}
                      >
                        {violations.length > 0 ? (
                          violations.slice(0, 8).map((v, i) => (
                            <tr key={v.id}>
                              <td className="p-2.5 border-r border-inherit font-mono tabular-nums">
                                {i + 1}
                              </td>
                              <td className="p-2.5 border-r border-inherit">
                                {v.area} ({v.cameraName})
                              </td>
                              <td
                                className={`p-2.5 border-r border-inherit font-medium ${
                                  isBranded ? 'text-amber-300' : 'text-amber-700'
                                }`}
                              >
                                {v.violationType === 'no_helmet' &&
                                  (language === 'kz'
                                    ? 'Қорғаныс дулығасы жоқ'
                                    : 'Отсутствие защитной каски')}
                                {v.violationType === 'no_vest' &&
                                  (language === 'kz'
                                    ? 'Сигналдық кеудеше жоқ'
                                    : 'Отсутствие сигнального жилета')}
                                {v.violationType === 'no_goggles' &&
                                  (language === 'kz'
                                    ? 'Қорғаныс көзілдірігі жоқ'
                                    : 'Отсутствие защитных очков')}
                                {v.violationType === 'hazard_zone_entry' &&
                                  (language === 'kz'
                                    ? 'Қауіпті аймаққа кіру'
                                    : 'Вход в опасную крановую зону')}
                              </td>
                              <td className="p-2.5 border-r border-inherit font-mono tabular-nums">
                                {(v.confidence * 100).toFixed(0)}%
                              </td>
                              <td
                                className={`p-2.5 font-mono ${
                                  isBranded ? 'text-emerald-400' : 'text-emerald-700'
                                }`}
                              >
                                {v.status === 'resolved'
                                  ? language === 'kz'
                                    ? 'Жойылды'
                                    : 'Устранено'
                                  : language === 'kz'
                                  ? 'Бақылауда'
                                  : 'На контроле'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500">
                              {profile?.hasConnectedHardware === false
                                ? language === 'kz'
                                  ? 'Жабдық әлі қосылмаған. Бұзушылықтар жоқ.'
                                  : 'Оборудование пока не подключено. Нарушений нет.'
                                : language === 'kz'
                                ? 'Есепті кезеңде бұзушылықтар тіркелмеді (100% сәйкестік).'
                                : 'Нарушений за отчетный период не зафиксировано (100% соблюдение).'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {violations.length > 8 && (
                      <div className="mt-2 text-[11px] text-slate-400 font-mono">
                        {language === 'kz'
                          ? `Жүктелетін PDF файлында барлық ${violations.length} жазба толық көрсетіледі.`
                          : `В скачиваемый PDF-файл войдут все ${violations.length} записей с авторазбивкой по страницам.`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Eco Report Preview */}
              {reportType === 'eco' && (
                <div className="space-y-4 text-xs">
                  <div
                    className={`font-bold text-sm border-b pb-2 ${
                      isBranded
                        ? 'text-emerald-400 border-slate-800'
                        : 'text-emerald-800 border-slate-200'
                    }`}
                  >
                    {language === 'kz'
                      ? '2. Шығарындылар ШРК ресми рапорты (2-ТП Ауа / ҚР Экология министрлігі)'
                      : '2. Официальный рапорт ПДК выбросов (Форма 2-ТП Воздух / Минэкологии РК)'}
                  </div>
                  <p className={isBranded ? 'text-slate-300 leading-relaxed' : 'text-slate-700 leading-relaxed'}>
                    {language === 'kz'
                      ? 'ҚР Экологиялық кодексінің талаптарына сәйкес үздіксіз экологиялық мониторингтің автоматты бекеттерінің (АСТЭМ) көрсеткіштері.'
                      : 'Сводные показатели автоматических постов непрерывного экологического мониторинга (АСТЭМ) согласно требованиям Экологического кодекса Республики Казахстан.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {ecoSensors.length > 0 ? (
                      ecoSensors.map((s) => (
                        <div
                          key={s.id}
                          className={`p-3 rounded-lg border ${
                            isBranded
                              ? 'border-slate-800 bg-slate-900/70'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{s.name}</div>
                          <div
                            className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                              isBranded ? 'text-emerald-400' : 'text-emerald-700'
                            }`}
                          >
                            {s.currentValue} {s.unit}
                          </div>
                          <div className={isBranded ? 'text-[10px] text-slate-400' : 'text-[10px] text-slate-600'}>
                            {language === 'kz' ? 'ШРК шегі:' : 'Норма ПДК:'} &le; {s.thresholdCritical}{' '}
                            {s.unit}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">{s.area}</div>
                        </div>
                      ))
                    ) : (
                      <div className="sm:col-span-3 p-4 text-center text-slate-500 border border-dashed border-slate-700/60 rounded-lg">
                        {language === 'kz'
                          ? 'Газ тазалау датчиктері қосылмаған.'
                          : 'Датчики газоочистки не подключены.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Equipment Diagnostics Preview */}
              {reportType === 'equipment' && (
                <div className="space-y-4 text-xs">
                  <div
                    className={`font-bold text-sm border-b pb-2 ${
                      isBranded
                        ? 'text-amber-400 border-slate-800'
                        : 'text-amber-800 border-slate-200'
                    }`}
                  >
                    {language === 'kz'
                      ? '3. Жабдықтардың діріл диагностикасы актісі (FailPredict / ISO 10816-3)'
                      : '3. Акт виброакустической диагностики оборудования (FailPredict / ISO 10816-3)'}
                  </div>
                  <p className={isBranded ? 'text-slate-300 leading-relaxed' : 'text-slate-700 leading-relaxed'}>
                    {language === 'kz'
                      ? 'ISO 10816-3 стандарты бойынша діріл RMS, температура және қалдық ресурс (RUL) талдау нәтижелері.'
                      : 'Заключение по состоянию агрегатов на основе виброускорения RMS, температуры опор и прогноза остаточного ресурса до отказа (RUL).'}
                  </p>

                  <div className="overflow-x-auto">
                    <table
                      className={`w-full text-left border rounded-lg overflow-hidden ${
                        isBranded ? 'border-slate-800' : 'border-slate-300'
                      }`}
                    >
                      <thead
                        className={`text-[11px] font-mono ${
                          isBranded
                            ? 'bg-slate-900 text-slate-300'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5 border-b border-r border-inherit">№</th>
                          <th className="p-2.5 border-b border-r border-inherit">
                            {language === 'kz' ? 'Агрегат / Цех' : 'Агрегат / Цех'}
                          </th>
                          <th className="p-2.5 border-b border-r border-inherit">RMS</th>
                          <th className="p-2.5 border-b border-r border-inherit">RUL</th>
                          <th className="p-2.5 border-b border-inherit">
                            {language === 'kz' ? 'Тәуекел' : 'Статус'}
                          </th>
                        </tr>
                      </thead>
                      <tbody
                        className={`divide-y text-[11px] ${
                          isBranded ? 'divide-slate-800' : 'divide-slate-200'
                        }`}
                      >
                        {machines.length > 0 ? (
                          machines.map((m, i) => (
                            <tr key={m.id}>
                              <td className="p-2.5 border-r border-inherit font-mono tabular-nums">
                                {i + 1}
                              </td>
                              <td className="p-2.5 border-r border-inherit">
                                {m.name} ({m.area})
                              </td>
                              <td className="p-2.5 border-r border-inherit font-mono tabular-nums">
                                {m.vibrationRmsMmS.toFixed(1)} мм/с
                              </td>
                              <td className="p-2.5 border-r border-inherit font-mono tabular-nums">
                                {m.remainingUsefulLifeHours} ч
                              </td>
                              <td
                                className={`p-2.5 font-mono uppercase ${
                                  m.riskStatus === 'critical' || m.riskStatus === 'high'
                                    ? isBranded
                                      ? 'text-rose-400'
                                      : 'text-rose-700'
                                    : isBranded
                                    ? 'text-emerald-400'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {m.riskStatus} ({m.failureProbabilityPercent}%)
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500">
                              {language === 'kz'
                                ? 'Вибробақылау агрегаттары қосылмаған.'
                                : 'Технологические агрегаты пока не подключены.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ROI / MRP Preview */}
              {reportType === 'roi' && (
                <div className="space-y-4 text-xs">
                  <div
                    className={`font-bold text-sm border-b pb-2 ${
                      isBranded
                        ? 'text-amber-400 border-slate-800'
                        : 'text-amber-800 border-slate-200'
                    }`}
                  >
                    {language === 'kz'
                      ? '4. Алдын алынған экологиялық және апаттық залал есебі (ҚР АЕК)'
                      : '4. Расчет предотвращенного экологического и аварийного ущерба (в МРП РК)'}
                  </div>
                  <p className={isBranded ? 'text-slate-300 leading-relaxed' : 'text-slate-700 leading-relaxed'}>
                    {language === 'kz'
                      ? 'ҚР Салық кодексінің 574-бабы және ӘҚБтК талаптары негізінде:'
                      : 'На основании статьи 574 Налогового кодекса РК и Кодекса об административных правонарушениях РК за превышение установленных нормативов эмиссий и нарушение требований ТБ:'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      className={`p-4 rounded-xl border ${
                        isBranded
                          ? 'border-amber-500/40 bg-amber-950/20'
                          : 'border-amber-300 bg-amber-50'
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold ${
                          isBranded ? 'text-amber-300' : 'text-amber-800'
                        }`}
                      >
                        {language === 'kz'
                          ? 'Алдын алынған айыппұлдар:'
                          : 'Предотвращено штрафов по залповым выбросам:'}
                      </div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                        {estimatedFineAvoidanceMRP} МРП
                      </div>
                      <div className={`text-xs mt-1 ${isBranded ? 'text-slate-400' : 'text-slate-600'}`}>
                        {language === 'kz' ? 'Баламасы:' : 'Эквивалентно:'}{' '}
                        <strong>{estimatedSavingsKZT} ₸</strong> (3 932 ₸/МРП, 2026)
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-xl border ${
                        isBranded
                          ? 'border-cyan-500/40 bg-cyan-950/20'
                          : 'border-cyan-300 bg-cyan-50'
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold ${
                          isBranded ? 'text-cyan-300' : 'text-cyan-800'
                        }`}
                      >
                        {language === 'kz'
                          ? 'Сақталған жабдық моторесурсы:'
                          : 'Предиктивно сохраненный моторесурс оборудования:'}
                      </div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                        142 {language === 'kz' ? 'сағат' : 'часа'}
                      </div>
                      <div className={`text-xs mt-1 ${isBranded ? 'text-slate-400' : 'text-slate-600'}`}>
                        {language === 'kz'
                          ? 'Түтін сорғыштар мен диірмендердегі апаттық тоқтаулардың алдын алу'
                          : 'Предотвращение аварийных остановов на дымососах и мельницах'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Signatures & QR Cryptographic Seal Preview */}
              <div
                className={`mt-6 pt-5 border-t grid grid-cols-1 sm:grid-cols-2 gap-6 text-[11px] ${
                  isBranded ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-700'
                }`}
              >
                <div>
                  <div className={`font-semibold ${isBranded ? 'text-white' : 'text-slate-900'}`}>
                    {language === 'kz'
                      ? 'Бас инженер / ЕҚ жауапты тұлға:'
                      : 'Главный инженер / Ответственный за ТБ:'}
                  </div>
                  <div
                    className={`mt-5 border-b w-3/4 ${
                      isBranded ? 'border-slate-700' : 'border-slate-400'
                    }`}
                  />
                  <div className="text-[10px] text-slate-400 mt-1.5">
                    {profile?.contactPerson ||
                      (language === 'kz'
                        ? 'Кәсіпорын инженері'
                        : 'Ответственный инженер предприятия')}
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className={`font-semibold ${isBranded ? 'text-white' : 'text-slate-900'}`}>
                      {language === 'kz'
                        ? 'NeuroFactory Edge цифрлық верификациясы:'
                        : 'Цифровая верификация NeuroFactory Edge:'}
                    </div>
                    <div
                      className={`font-mono text-[10px] truncate ${
                        isBranded ? 'text-emerald-400' : 'text-emerald-700'
                      }`}
                    >
                      SHA256: {verificationHash}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'kz'
                        ? 'Ядроның криптографиялық қолтаңбасымен расталған'
                        : 'Заверено криптографической подписью ядра'}
                    </div>
                  </div>

                  {qrSealUrl && (
                    <img
                      src={qrSealUrl}
                      alt="Verification QR"
                      className={`h-14 w-14 rounded border shrink-0 ${
                        isBranded ? 'border-cyan-500/30' : 'border-slate-300'
                      }`}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Banners */}
          {downloadNotice && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{downloadNotice}</span>
            </div>
          )}

          {pdfError && (
            <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 flex items-center gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{pdfError}</span>
            </div>
          )}

          {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 text-xs">
            <div className="text-slate-400 text-[11px]">
              {language === 'kz'
                ? 'Құжат фирмалық A4 PDF форматында экспортталады'
                : 'Генерируется официальный A4 PDF-документ с фирменным оформлением'}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.common.close}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting || isGeneratingPdf}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 text-cyan-400" />
                )}
                <span>{language === 'kz' ? 'Басып шығару' : 'Печать'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf || isPrinting}
                className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-bold text-white transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>
                  {isGeneratingPdf
                    ? language === 'kz'
                      ? 'PDF жасалуда...'
                      : 'Создание PDF...'
                    : language === 'kz'
                    ? 'PDF жүктеу'
                    : 'Скачать PDF'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
