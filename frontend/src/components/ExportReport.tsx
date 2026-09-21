import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { MatchOverview, PlayerStats } from '../types/match';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';

interface ExportReportProps {
  match: MatchOverview;
  player?: {
    name: string;
    team: 'CT' | 'T';
    stats?: PlayerStats;
  };
  reportElementId?: string;
  mapElementId?: string;
  label?: string;
  className?: string;
}

export function ExportReport({
  match,
  player,
  reportElementId = 'match-report',
  mapElementId,
  label,
  className,
}: ExportReportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const mapConfig = getMapConfig(match.map_name);

  const exportPdf = async () => {
    setIsExporting(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 20;

      const title = player ? 'CS2 Player Report' : 'CS2 Match Report';
      pdf.setFontSize(18);
      pdf.text(title, 20, y);
      y += 12;

      pdf.setFontSize(11);
      pdf.text(`Match ID: ${match.match_id}`, 20, y);
      y += 7;
      pdf.text(`Map: ${mapConfig.displayName}`, 20, y);
      y += 7;
      pdf.text(`Score: CT ${match.score_ct} - ${match.score_t} T`, 20, y);
      y += 10;

      if (player) {
        pdf.setFontSize(14);
        pdf.text(`Player: ${player.name}`, 20, y);
        y += 8;
        pdf.setFontSize(11);
        pdf.text(`Team: ${player.team}`, 20, y);
        y += 7;

        if (player.stats) {
          pdf.text(
            `K/D/A: ${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`,
            20,
            y,
          );
          y += 7;
          pdf.text(`Headshot %: ${player.stats.headshot_pct}%`, 20, y);
          y += 7;
          pdf.text(`Favorite weapon: ${player.stats.favorite_weapon}`, 20, y);
          y += 7;
          pdf.text(
            `Avg blind duration: ${player.stats.avg_blind_duration_ms} ms`,
            20,
            y,
          );
          y += 10;
        }
      }

      const reportElement = document.getElementById(reportElementId);
      if (reportElement) {
        const canvas = await html2canvas(reportElement, {
          backgroundColor: '#020617',
          scale: 2,
          useCORS: true,
        });
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * pageWidth) / canvas.width;

        if (y + imgHeight > 280) {
          pdf.addPage();
          y = 20;
        }

        pdf.addImage(imgData, 'PNG', 0, y, pageWidth, imgHeight);
        y += imgHeight + 10;
      }

      const mapElement = mapElementId ? document.getElementById(mapElementId) : null;
      if (mapElement) {
        const mapCanvas = await html2canvas(mapElement, {
          backgroundColor: '#020617',
          scale: 2,
          useCORS: true,
        });
        const mapImg = mapCanvas.toDataURL('image/png');
        const mapHeight = (mapCanvas.height * pageWidth) / mapCanvas.width;

        if (y + mapHeight > 280) {
          pdf.addPage();
          y = 0;
        }

        pdf.addImage(mapImg, 'PNG', 0, y, pageWidth, mapHeight);
      }

      const filename = player
        ? `report_${player.name}_${match.match_id}.pdf`
        : `match-${match.match_id}-report.pdf`;

      pdf.save(filename);
      toast.success('Отчёт успешно экспортирован');
    } catch {
      toast.error('Ошибка при экспорте отчёта');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={exportPdf}
      disabled={isExporting}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-700 hover:text-white disabled:opacity-50',
        className,
      )}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label ?? (player ? 'Скачать PDF отчёт' : 'Экспорт отчёта')}
    </button>
  );
}
