import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PenTool, Plus } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { Badge, Button, Empty, Loading, PageHeader, Select, timeAgo } from '../../academy/ui';
import { MAPS, mapTitle, radarImage } from '../../academy/radar';

export function BoardsPage() {
  const navigate = useNavigate();
  const [map, setMap] = useState('de_mirage');
  const q = useQuery({ queryKey: ['academy', 'boards'], queryFn: () => academyApi.boards() });
  const create = useMutation({ mutationFn: () => academyApi.createBoard({ map_name: map, title: `Тактика ${mapTitle(map)}` }), onSuccess: (b) => navigate(`/boards/${b.id}`) });
  return (
    <div className="animate-fade-in">
      <PageHeader title="Тактическая доска" subtitle="Рисуйте тактики вместе в реальном времени. Доска из разбора раунда синхронизирована с 2D-реплеем." actions={<>
        <Select value={map} onChange={setMap} options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-36" />
        <Button variant="primary" onClick={() => create.mutate()} loading={create.isPending}><Plus className="h-4 w-4" />Новая доска</Button>
      </>} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty icon={<PenTool className="h-8 w-8" />} title="Досок пока нет" hint="Создайте пустую доску или откройте раунд в разборе матча и нажмите «На доску»." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {q.data.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0d10] transition hover:-translate-y-0.5 hover:border-[var(--color-signal)]/40">
              <div className="relative aspect-[16/9] overflow-hidden bg-black">
                <img src={radarImage(b.map_name)} alt="" className="h-full w-full object-cover opacity-50 transition group-hover:opacity-70" />
                {b.match_id && <Badge tone="signal" className="absolute left-2 top-2">Раунд {b.round_number}</Badge>}
              </div>
              <div className="p-3">
                <p className="truncate font-semibold">{b.title}</p>
                <p className="text-xs text-slate-500">{mapTitle(b.map_name)} · {b.shapes_count ?? 0} фигур · {b.author ?? '—'} · {timeAgo(b.updated_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
