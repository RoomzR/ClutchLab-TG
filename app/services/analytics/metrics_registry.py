"""Single source of truth for every metric shown in the product.

Each player metric is derived from summable counters (see engine.py), so the same
formula works for one match, one side, or any aggregate of matches.

confidence:
  exact      — read directly from demo events
  derived    — computed from exact events with a documented rule
  estimated  — approximation (sampling, heuristics); shown with a marker in the UI
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Callable

METRIC_VERSION = "2026.10.1"

GROUPS: list[dict[str, str]] = [
    {"id": "core", "ru": "Базовые", "en": "Core"},
    {"id": "multikills", "ru": "Мультикиллы и клатчи", "en": "Multi-kills & clutches"},
    {"id": "duels", "ru": "Дуэли и открытие", "en": "Duels & openings"},
    {"id": "trades", "ru": "Трейды", "en": "Trades"},
    {"id": "aim", "ru": "Стрельба и механика", "en": "Shooting & mechanics"},
    {"id": "damage", "ru": "Урон", "en": "Damage"},
    {"id": "utility", "ru": "Утилити", "en": "Utility"},
    {"id": "economy", "ru": "Экономика", "en": "Economy"},
    {"id": "bomb", "ru": "Бомба", "en": "Bomb"},
    {"id": "positioning", "ru": "Позиционирование", "en": "Positioning"},
]


@dataclass(frozen=True)
class Metric:
    id: str
    group: str
    ru: str
    en: str
    description: str
    formula: str
    source: str
    unit: str  # num | pct | sec | ms | deg | money | units | ratio
    better: str  # higher | lower | neutral
    confidence: str  # exact | derived | estimated
    min_sample: str = ""
    key: bool = False


def _div(a: float, b: float) -> float | None:
    return (a / b) if b else None


def _pct(a: float, b: float) -> float | None:
    return (100.0 * a / b) if b else None


# id -> (Metric, compute(counters) -> value)
_REGISTRY: dict[str, tuple[Metric, Callable[[dict[str, float]], float | None]]] = {}


def _m(metric: Metric, fn: Callable[[dict[str, float]], float | None]) -> None:
    _REGISTRY[metric.id] = (metric, fn)


def c(counters: dict[str, float], key: str) -> float:
    return float(counters.get(key, 0) or 0)


def _impact(k: dict[str, float]) -> float | None:
    rounds = c(k, "rounds")
    if not rounds:
        return None
    return 2.13 * c(k, "kills") / rounds + 0.42 * c(k, "assists") / rounds - 0.41


def _rating(k: dict[str, float]) -> float | None:
    rounds = c(k, "rounds")
    if not rounds:
        return None
    kast = 100.0 * c(k, "kast_rounds") / rounds
    kpr = c(k, "kills") / rounds
    dpr = c(k, "deaths") / rounds
    adr = c(k, "damage") / rounds
    impact = _impact(k) or 0.0
    return 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587


# ───────────────────────── core ─────────────────────────
_m(Metric("rating", "core", "Рейтинг", "Rating",
          "Сводная оценка вклада. 1.00 — средний уровень.",
          "0.0073·KAST + 0.3591·KPR − 0.5329·DPR + 0.2372·Impact + 0.0032·ADR + 0.1587 (публичная аппроксимация Rating 2.0)",
          "player_death, player_hurt", "ratio", "higher", "derived", "≥ 10 раундов", key=True), _rating)
_m(Metric("impact", "core", "Импакт", "Impact",
          "Влияние киллами и ассистами на раунд.", "2.13·KPR + 0.42·APR − 0.41",
          "player_death", "ratio", "higher", "derived"), _impact)
_m(Metric("kills", "core", "Убийства", "Kills", "Убийства противников (без тимкиллов).", "Σ kills",
          "player_death", "num", "higher", "exact", key=True), lambda k: c(k, "kills"))
_m(Metric("deaths", "core", "Смерти", "Deaths", "Все смерти игрока.", "Σ deaths",
          "player_death", "num", "lower", "exact"), lambda k: c(k, "deaths"))
_m(Metric("assists", "core", "Ассисты", "Assists", "Ассисты по урону и флешкам.", "Σ assister",
          "player_death.assister", "num", "higher", "exact"), lambda k: c(k, "assists"))
_m(Metric("kd", "core", "K/D", "K/D", "Отношение убийств к смертям.", "kills / deaths",
          "player_death", "ratio", "higher", "exact", key=True), lambda k: _div(c(k, "kills"), c(k, "deaths")))
_m(Metric("kd_diff", "core", "K−D", "K−D", "Разница убийств и смертей.", "kills − deaths",
          "player_death", "num", "higher", "exact"), lambda k: c(k, "kills") - c(k, "deaths"))
_m(Metric("adr", "core", "ADR", "ADR", "Средний урон по противникам за раунд (с учётом остатка HP).",
          "Σ min(dmg, hp_before) / rounds", "player_hurt", "num", "higher", "exact", key=True),
   lambda k: _div(c(k, "damage"), c(k, "rounds")))
_m(Metric("kpr", "core", "KPR", "KPR", "Убийств за раунд.", "kills / rounds", "player_death", "ratio", "higher", "exact"),
   lambda k: _div(c(k, "kills"), c(k, "rounds")))
_m(Metric("dpr", "core", "DPR", "DPR", "Смертей за раунд.", "deaths / rounds", "player_death", "ratio", "lower", "exact"),
   lambda k: _div(c(k, "deaths"), c(k, "rounds")))
_m(Metric("apr", "core", "APR", "APR", "Ассистов за раунд.", "assists / rounds", "player_death", "ratio", "higher", "exact"),
   lambda k: _div(c(k, "assists"), c(k, "rounds")))
_m(Metric("hs_pct", "core", "HS%", "HS%", "Доля убийств в голову.", "headshot_kills / kills",
          "player_death.headshot", "pct", "higher", "exact", key=True), lambda k: _pct(c(k, "headshot_kills"), c(k, "kills")))
_m(Metric("kast_pct", "core", "KAST", "KAST",
          "Доля раундов, где игрок убил, ассистировал, выжил или его смерть разменяли.",
          "rounds(K∨A∨S∨T) / rounds", "player_death", "pct", "higher", "derived", key=True),
   lambda k: _pct(c(k, "kast_rounds"), c(k, "rounds")))
_m(Metric("survival_pct", "core", "Выживаемость", "Survival", "Доля раундов, в которых игрок выжил.",
          "survived_rounds / rounds", "player_death", "pct", "higher", "exact"),
   lambda k: _pct(c(k, "survived_rounds"), c(k, "rounds")))
_m(Metric("mvp_rounds", "core", "MVP раундов", "Round MVPs",
          "Раунды, где у игрока лучший вклад в команде (киллы, урон, ключевые действия).",
          "count(round score = max in team)", "player_death, player_hurt, bomb", "num", "higher", "derived"),
   lambda k: c(k, "mvp_rounds"))

# ───────────────────── multikills & clutches ─────────────────────
for n in (2, 3, 4, 5):
    _m(Metric(f"multi_{n}k", "multikills", f"{n}K раунды", f"{n}K rounds", f"Раунды ровно с {n} убийствами.",
              f"count(round kills = {n})", "player_death", "num", "higher", "exact"),
       (lambda key: (lambda k: c(k, key)))(f"multi_{n}k"))
_m(Metric("multikill_rounds", "multikills", "Мультикилл-раунды", "Multi-kill rounds", "Раунды с 2+ убийствами.",
          "Σ 2K..5K", "player_death", "num", "higher", "exact"),
   lambda k: sum(c(k, f"multi_{n}k") for n in (2, 3, 4, 5)))
_m(Metric("clutch_attempts", "multikills", "Клатчи (попытки)", "Clutch attempts",
          "Раунды, где игрок остался последним живым против 1+ соперников.", "count(1vX)",
          "player_death", "num", "neutral", "derived"), lambda k: c(k, "clutch_attempts"))
_m(Metric("clutch_wins", "multikills", "Клатчи (победы)", "Clutches won", "Выигранные клатчи 1vX.", "count(1vX won)",
          "player_death, round_end", "num", "higher", "derived", key=True), lambda k: c(k, "clutch_wins"))
_m(Metric("clutch_pct", "multikills", "Клатчи, %", "Clutch %", "Доля выигранных клатчей.", "clutch_wins / clutch_attempts",
          "player_death, round_end", "pct", "higher", "derived", "≥ 3 попыток"),
   lambda k: _pct(c(k, "clutch_wins"), c(k, "clutch_attempts")))
for n in (1, 2, 3, 4, 5):
    _m(Metric(f"clutch_1v{n}", "multikills", f"1v{n} (победы/попытки)", f"1v{n} won", f"Выигранные клатчи 1v{n}.",
              f"won 1v{n}", "player_death, round_end", "num", "higher", "derived"),
       (lambda key: (lambda k: c(k, key)))(f"clutch_1v{n}_won"))
_m(Metric("saves", "multikills", "Сейвы", "Saves", "Выжил в проигранном раунде (сохранил оружие).",
          "count(survived ∧ round lost)", "player_death, round_end", "num", "neutral", "derived"), lambda k: c(k, "saves"))
_m(Metric("last_alive_pct", "multikills", "Последний живой", "Last alive %",
          "Доля раундов, где игрок оставался последним живым в команде.", "last_alive_rounds / rounds",
          "player_death", "pct", "neutral", "derived"), lambda k: _pct(c(k, "last_alive_rounds"), c(k, "rounds")))

# ───────────────────── duels & openings ─────────────────────
_m(Metric("opening_attempts", "duels", "Опенинги (участие)", "Opening duels", "Участие в первой дуэли раунда.",
          "opening_kills + opening_deaths", "player_death", "num", "neutral", "exact"), lambda k: c(k, "opening_attempts"))
_m(Metric("opening_kills", "duels", "Первые убийства", "Opening kills", "Первое убийство раунда.", "count(first kill)",
          "player_death", "num", "higher", "exact", key=True), lambda k: c(k, "opening_kills"))
_m(Metric("opening_deaths", "duels", "Первые смерти", "Opening deaths", "Первая смерть раунда.", "count(first death)",
          "player_death", "num", "lower", "exact"), lambda k: c(k, "opening_deaths"))
_m(Metric("opening_success_pct", "duels", "Опенинг, %", "Opening success", "Доля выигранных первых дуэлей.",
          "opening_kills / opening_attempts", "player_death", "pct", "higher", "exact", "≥ 5 дуэлей", key=True),
   lambda k: _pct(c(k, "opening_kills"), c(k, "opening_attempts")))
_m(Metric("opening_attempt_pct", "duels", "Частота опенингов", "Opening attempt rate",
          "В какой доле раундов игрок участвует в первой дуэли.", "opening_attempts / rounds", "player_death", "pct", "neutral", "exact"),
   lambda k: _pct(c(k, "opening_attempts"), c(k, "rounds")))
_m(Metric("opening_kill_win_pct", "duels", "Раунды после первого килла, %", "Win % after opening kill",
          "Как часто команда выигрывает раунд после первого убийства игрока.", "rounds_won_after_opening_kill / opening_kills",
          "player_death, round_end", "pct", "higher", "derived"),
   lambda k: _pct(c(k, "opening_kills_won"), c(k, "opening_kills")))
_m(Metric("entry_success_pct", "duels", "Энтри (T), %", "Entry success (T)", "Выигранные первые дуэли за сторону T.",
          "entry_kills / entry_attempts", "player_death", "pct", "higher", "exact"),
   lambda k: _pct(c(k, "entry_kills"), c(k, "entry_attempts")))
_m(Metric("awp_kills", "duels", "Убийства с AWP", "AWP kills", "Убийства с AWP.", "count(weapon = awp)",
          "player_death.weapon", "num", "neutral", "exact"), lambda k: c(k, "awp_kills"))
_m(Metric("avg_kill_distance", "duels", "Средняя дистанция килла", "Avg kill distance",
          "Средняя дистанция убийств (метры CS2).", "Σ distance / kills", "player_death.distance", "num", "neutral", "exact"),
   lambda k: _div(c(k, "kill_distance_sum"), c(k, "kill_distance_n")))

# ───────────────────── trades ─────────────────────
_m(Metric("trade_kills", "trades", "Трейд-киллы", "Trade kills",
          "Убийства противника, который убил тиммейта не более 5 с назад.", "count(kill ≤ 5 s after teammate death by victim)",
          "player_death", "num", "higher", "derived"), lambda k: c(k, "trade_kills"))
_m(Metric("traded_death_pct", "trades", "Разменянные смерти", "Traded deaths",
          "Доля смертей, которые тиммейты разменяли в течение 5 с.", "traded_deaths / deaths",
          "player_death", "pct", "higher", "derived", key=True), lambda k: _pct(c(k, "traded_deaths"), c(k, "deaths")))
_m(Metric("untraded_death_pct", "trades", "Смерти без размена", "Untraded deaths",
          "Доля смертей, которые никто не разменял.", "untraded_deaths / deaths", "player_death", "pct", "lower", "derived"),
   lambda k: _pct(c(k, "untraded_deaths"), c(k, "deaths")))
_m(Metric("avg_trade_time", "trades", "Время размена", "Time to trade", "Среднее время между смертью тиммейта и трейдом.",
          "Σ trade_time / trade_kills", "player_death", "sec", "lower", "derived"),
   lambda k: _div(c(k, "trade_time_sum"), c(k, "trade_time_n")))
_m(Metric("death_spacing", "trades", "Дистанция до тиммейта при смерти", "Teammate distance at death",
          "Расстояние до ближайшего живого тиммейта в момент смерти (юниты).", "Σ dist / deaths_sampled",
          "positions", "units", "lower", "estimated"), lambda k: _div(c(k, "death_spacing_sum"), c(k, "death_spacing_n")))
_m(Metric("isolated_death_pct", "trades", "Изолированные смерти", "Isolated deaths",
          "Смерти, когда ближайший тиммейт дальше 1000 юнитов — размен невозможен.", "isolated_deaths / deaths_sampled",
          "positions", "pct", "lower", "estimated"), lambda k: _pct(c(k, "isolated_deaths"), c(k, "death_spacing_n")))

# ───────────────────── aim & mechanics ─────────────────────
_m(Metric("accuracy_pct", "aim", "Точность", "Accuracy", "Попадания по игрокам / выстрелы (огнестрел).",
          "bullet_hits / shots", "weapon_fire, player_hurt", "pct", "higher", "derived", "≥ 50 выстрелов", key=True),
   lambda k: _pct(min(c(k, "hits"), c(k, "shots")), c(k, "shots")))
_m(Metric("head_hit_pct", "aim", "Попадания в голову", "Head hit %", "Доля попаданий в голову.", "head_hits / hits",
          "player_hurt.hitgroup", "pct", "higher", "exact"), lambda k: _pct(c(k, "head_hits"), c(k, "hits")))
_m(Metric("first_shot_acc_pct", "aim", "Точность первой пули", "First-shot accuracy",
          "Доля первых выстрелов серии (пауза ≥ 0.5 с), попавших в игрока.", "first_shot_hits / first_shots",
          "weapon_fire, player_hurt", "pct", "higher", "derived"), lambda k: _pct(c(k, "first_shot_hits"), c(k, "first_shots")))
_m(Metric("spray_acc_pct", "aim", "Точность в спрее", "Spray accuracy",
          "Попадания выстрелов, сделанных в серии (интервал < 0.2 с).", "spray_hits / spray_shots",
          "weapon_fire, player_hurt", "pct", "higher", "derived"), lambda k: _pct(c(k, "spray_hits"), c(k, "spray_shots")))
_m(Metric("counter_strafe_pct", "aim", "Контрстрейф", "Counter-strafe",
          "Доля первых выстрелов из винтовок/снайперок/пистолетов при скорости ниже порога точности оружия (34% от макс.).",
          "cs_good / cs_shots", "weapon_fire.velocity", "pct", "higher", "exact", "≥ 20 выстрелов", key=True),
   lambda k: _pct(c(k, "cs_good"), c(k, "cs_shots")))
_m(Metric("reaction_ms", "aim", "Реакция (прокси)", "Reaction (proxy)",
          "Время от первого полученного урона в дуэли до ответного урона.", "Σ (t_reply − t_hit) / n",
          "player_hurt", "ms", "lower", "estimated"), lambda k: _div(c(k, "reaction_sum_ms"), c(k, "reaction_n")))
_m(Metric("crosshair_deg", "aim", "Кроссхейр-плейсмент", "Crosshair placement",
          "Средний угол между прицелом и противником за 250 мс до первого попадания по нему.", "mean angle(view, enemy)",
          "positions(yaw, pitch), player_hurt", "deg", "lower", "estimated", key=True),
   lambda k: _div(c(k, "xhair_sum_deg"), c(k, "xhair_n")))
_m(Metric("crosshair_good_pct", "aim", "Прицел «на линии»", "Crosshair on target",
          "Доля дуэлей, где прицел был в пределах 5° от противника до первого выстрела.", "xhair_good / xhair_n",
          "positions, player_hurt", "pct", "higher", "estimated"), lambda k: _pct(c(k, "xhair_good"), c(k, "xhair_n")))
_m(Metric("death_aim_deg", "aim", "Прицел в момент смерти", "Aim error at death",
          "Угол между прицелом игрока и убийцей за 250 мс до смерти — насколько ты не ждал противника.",
          "mean angle(view, killer)", "positions, player_death", "deg", "lower", "estimated"),
   lambda k: _div(c(k, "death_aim_sum"), c(k, "death_aim_n")))
_m(Metric("wallbang_kills", "aim", "Прострелы", "Wallbang kills", "Убийства сквозь стену.", "count(penetrated > 0)",
          "player_death.penetrated", "num", "neutral", "exact"), lambda k: c(k, "wallbang_kills"))
_m(Metric("smoke_kills", "aim", "Киллы через смок", "Through-smoke kills", "Убийства через дым.", "count(thrusmoke)",
          "player_death.thrusmoke", "num", "neutral", "exact"), lambda k: c(k, "smoke_kills"))
_m(Metric("blind_kills", "aim", "Киллы ослеплённым", "Kills while blind", "Убийства, сделанные будучи ослеплённым.",
          "count(attackerblind)", "player_death.attackerblind", "num", "neutral", "exact"), lambda k: c(k, "blind_kills"))
_m(Metric("noscope_kills", "aim", "Ноускопы", "No-scopes", "Убийства из снайперки без прицела.", "count(noscope)",
          "player_death.noscope", "num", "neutral", "exact"), lambda k: c(k, "noscope_kills"))
_m(Metric("air_kills", "aim", "Киллы в прыжке", "In-air kills", "Убийства в воздухе.", "count(attackerinair)",
          "player_death.attackerinair", "num", "neutral", "exact"), lambda k: c(k, "air_kills"))

# ───────────────────── damage ─────────────────────
_m(Metric("damage", "damage", "Урон", "Damage", "Суммарный урон по противникам.", "Σ dmg", "player_hurt", "num", "higher", "exact"),
   lambda k: c(k, "damage"))
_m(Metric("damage_taken_per_round", "damage", "Получено урона за раунд", "Damage taken / round",
          "Сколько урона игрок получает за раунд.", "damage_taken / rounds", "player_hurt", "num", "lower", "exact"),
   lambda k: _div(c(k, "damage_taken"), c(k, "rounds")))
_m(Metric("unfinished_per_round", "damage", "Недобитые за раунд", "Unfinished enemies / round",
          "Противники, получившие от игрока ≥ 50 урона и пережившие раунд.", "unfinished / rounds",
          "player_hurt, player_death", "ratio", "lower", "derived"), lambda k: _div(c(k, "unfinished_enemies"), c(k, "rounds")))
_m(Metric("team_damage", "damage", "Урон по своим", "Team damage", "Урон по тиммейтам.", "Σ dmg(same side)",
          "player_hurt", "num", "lower", "exact"), lambda k: c(k, "team_damage"))
_m(Metric("teamkills", "damage", "Тимкиллы", "Team kills", "Убийства своих.", "count", "player_death", "num", "lower", "exact"),
   lambda k: c(k, "teamkills"))

# ───────────────────── utility ─────────────────────
_m(Metric("utility_damage_per_round", "utility", "Урон утилити за раунд", "Utility damage / round",
          "Урон HE и молотовами по противникам за раунд.", "(he_dmg + fire_dmg) / rounds", "player_hurt", "num", "higher", "exact", key=True),
   lambda k: _div(c(k, "utility_damage"), c(k, "rounds")))
_m(Metric("he_damage", "utility", "Урон HE", "HE damage", "Суммарный урон осколочными.", "Σ dmg(hegrenade)",
          "player_hurt", "num", "higher", "exact"), lambda k: c(k, "he_damage"))
_m(Metric("fire_damage", "utility", "Урон молотовами", "Fire damage", "Суммарный урон огнём.", "Σ dmg(inferno)",
          "player_hurt", "num", "higher", "exact"), lambda k: c(k, "fire_damage"))
_m(Metric("enemies_flashed_per_round", "utility", "Ослеплено врагов за раунд", "Enemies flashed / round",
          "Сколько противников ослеплено флешками игрока за раунд.", "enemies_flashed / rounds",
          "flashbang_detonate + flash_duration", "ratio", "higher", "derived", key=True),
   lambda k: _div(c(k, "enemies_flashed"), c(k, "rounds")))
_m(Metric("avg_enemy_blind", "utility", "Среднее время ослепления врага", "Avg enemy blind time",
          "Средняя длительность ослепления противников флешками игрока.", "Σ blind / enemies_flashed",
          "flash_duration", "sec", "higher", "derived"), lambda k: _div(c(k, "enemy_blind_time"), c(k, "enemies_flashed")))
_m(Metric("flash_assists", "utility", "Флеш-ассисты", "Flash assists", "Убийства тиммейтов по ослеплённым игроком врагам.",
          "count(assistedflash)", "player_death.assistedflash", "num", "higher", "exact"), lambda k: c(k, "flash_assists"))
_m(Metric("flash_to_kill", "utility", "Флешка → килл", "Flash → kill",
          "Ослеплённый игроком противник убит командой в течение 3 с.", "count", "blinds, player_death", "num", "higher", "derived"),
   lambda k: c(k, "flash_to_kill"))
_m(Metric("team_flashes_per_round", "utility", "Тимфлеши за раунд", "Team flashes / round",
          "Ослеплённые своей флешкой тиммейты (> 0.5 с).", "team_flashed / rounds", "flash_duration", "ratio", "lower", "derived"),
   lambda k: _div(c(k, "team_flashed"), c(k, "rounds")))
_m(Metric("utility_per_round", "utility", "Утилити за раунд", "Utility thrown / round", "Брошено гранат за раунд.",
          "utility_thrown / rounds", "grenade detonations", "ratio", "higher", "exact"),
   lambda k: _div(c(k, "utility_thrown"), c(k, "rounds")))
for gkey, ru, en in (("flashes", "Флешки", "Flashes"), ("smokes", "Смоки", "Smokes"),
                     ("he", "HE", "HE"), ("molotovs", "Молотовы", "Molotovs")):
    _m(Metric(f"{gkey}_thrown", "utility", f"{ru} брошено", f"{en} thrown", f"Количество: {ru.lower()}.",
              "count", "grenade detonations", "num", "neutral", "exact"),
       (lambda key: (lambda k: c(k, key)))(f"{gkey}_thrown"))
_m(Metric("utility_before_contact_pct", "utility", "Утилити до контакта", "Utility before contact",
          "Доля гранат, брошенных до первого контакта команды в раунде.", "before_contact / utility_thrown",
          "grenades, player_hurt", "pct", "higher", "derived"),
   lambda k: _pct(c(k, "utility_before_contact"), c(k, "utility_thrown")))
_m(Metric("unused_util_value_per_death", "utility", "Неиспользованная утилити при смерти", "Unused utility at death",
          "Средняя стоимость гранат в инвентаре в момент смерти.", "Σ $ grenades in inventory / deaths",
          "inventory at death", "money", "lower", "exact", key=True),
   lambda k: _div(c(k, "unused_util_value"), c(k, "deaths")))
_m(Metric("times_blinded_per_round", "utility", "Был ослеплён за раунд", "Times blinded / round",
          "Сколько раз игрока ослепляли противники.", "times_blinded / rounds", "flash_duration", "ratio", "lower", "derived"),
   lambda k: _div(c(k, "times_blinded"), c(k, "rounds")))

# ───────────────────── economy ─────────────────────
_m(Metric("avg_equip", "economy", "Средняя экипировка", "Avg equipment value",
          "Средняя стоимость снаряжения через 3 с после фризтайма.", "Σ equip / rounds", "current_equip_value", "money", "neutral", "exact"),
   lambda k: _div(c(k, "equip_value_sum"), c(k, "rounds")))
_m(Metric("money_spent", "economy", "Потрачено", "Money spent", "Всего потрачено денег.", "Σ cash_spent_this_round",
          "cash_spent_this_round", "money", "neutral", "exact"), lambda k: c(k, "money_spent"))
_m(Metric("cost_per_kill", "economy", "Цена убийства", "Cost per kill", "Потрачено $ на одно убийство.", "money_spent / kills",
          "cash_spent_this_round, player_death", "money", "lower", "derived"), lambda k: _div(c(k, "money_spent"), c(k, "kills")))
_m(Metric("dmg_per_1000", "economy", "Урон на $1000", "Damage per $1000", "Эффективность вложенных денег.",
          "damage / (money_spent / 1000)", "player_hurt, cash_spent", "num", "higher", "derived"),
   lambda k: _div(c(k, "damage") * 1000.0, c(k, "money_spent")))
_m(Metric("buy_errors", "economy", "Ошибки закупа", "Buy errors",
          "Закуп не синхронно с командой: фулл-бай при эко команды или сейв, когда команда закупилась.", "count",
          "round_economy", "num", "lower", "derived"), lambda k: c(k, "buy_errors"))
for bkey, ru, en in (("pistol", "Пистолетки", "Pistol"), ("eco", "Эко", "Eco"), ("force", "Форс", "Force"), ("full", "Фулл-бай", "Full buy")):
    _m(Metric(f"win_pct_{bkey}", "economy", f"Победы: {ru}", f"Win % ({en})", f"Процент побед в раундах типа «{ru}» (по закупу команды).",
              f"wins_{bkey} / rounds_{bkey}", "round_economy, round_end", "pct", "higher", "derived"),
       (lambda key: (lambda k: _pct(c(k, f"wins_{key}"), c(k, f"rounds_{key}"))))(bkey))

# ───────────────────── bomb ─────────────────────
_m(Metric("plants", "bomb", "Планты", "Plants", "Установленные бомбы.", "count(bomb_planted)", "bomb_planted", "num", "neutral", "exact"),
   lambda k: c(k, "plants"))
_m(Metric("defuses", "bomb", "Дефьюзы", "Defuses", "Обезвреженные бомбы.", "count(bomb_defused)", "bomb_defused", "num", "higher", "exact"),
   lambda k: c(k, "defuses"))
_m(Metric("avg_plant_time", "bomb", "Время планта", "Avg plant time", "Секунд от конца фризтайма до планта.",
          "Σ (plant_tick − freeze_end) / plants", "bomb_planted", "sec", "neutral", "exact"),
   lambda k: _div(c(k, "plant_time_sum"), c(k, "plants")))
_m(Metric("defuses_no_kit", "bomb", "Дефьюзы без кита", "Defuses without kit", "Дефьюзы без набора сапёра.",
          "count(defuse ∧ ¬has_defuser)", "bomb_defused, has_defuser", "num", "neutral", "exact"), lambda k: c(k, "defuses_no_kit"))

# ───────────────────── positioning ─────────────────────
_m(Metric("distance_per_round", "positioning", "Дистанция за раунд", "Distance / round",
          "Сколько игрок проходит за раунд (юниты, по позициям каждые 0.125 с).", "Σ path / rounds",
          "positions", "units", "neutral", "estimated"), lambda k: _div(c(k, "distance_traveled"), c(k, "rounds")))
_m(Metric("avg_teammate_dist", "positioning", "Дистанция до команды", "Distance to team",
          "Средняя дистанция до ближайшего живого тиммейта.", "mean nearest-teammate distance", "positions", "units", "neutral", "estimated"),
   lambda k: _div(c(k, "teammate_dist_sum"), c(k, "alive_samples")))
_m(Metric("lurk_pct", "positioning", "Лурк-индекс", "Lurk index",
          "Доля времени, когда ближайший тиммейт дальше 1200 юнитов.", "lurk_samples / alive_samples", "positions", "pct", "neutral", "estimated"),
   lambda k: _pct(c(k, "lurk_samples"), c(k, "alive_samples")))
_m(Metric("position_repeat_pct", "positioning", "Предсказуемость позиции", "Position predictability",
          "Как часто игрок стоит в одной и той же зоне на 20-й секунде раунда за одну сторону.",
          "max zone count / rounds on side", "last_place_name", "pct", "lower", "derived", "≥ 6 раундов на стороне"),
   lambda k: _pct(c(k, "early_place_max"), c(k, "early_place_rounds")))


def all_metrics() -> list[dict[str, Any]]:
    return [asdict(m) for m, _ in _REGISTRY.values()]


def metric(metric_id: str) -> Metric | None:
    item = _REGISTRY.get(metric_id)
    return item[0] if item else None


def derive(counters: dict[str, float]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for mid, (_m_, fn) in _REGISTRY.items():
        try:
            value = fn(counters)
        except Exception:
            value = None
        out[mid] = None if value is None else round(float(value), 4)
    return out


# ───────────────────── team metrics ─────────────────────
TEAM_METRICS: list[dict[str, str]] = [
    {"id": "round_win_pct", "ru": "Раунды, %", "unit": "pct", "better": "higher", "description": "Доля выигранных раундов."},
    {"id": "ct_win_pct", "ru": "Раунды за CT, %", "unit": "pct", "better": "higher", "description": "Доля выигранных раундов за CT."},
    {"id": "t_win_pct", "ru": "Раунды за T, %", "unit": "pct", "better": "higher", "description": "Доля выигранных раундов за T."},
    {"id": "pistol_win_pct", "ru": "Пистолетки, %", "unit": "pct", "better": "higher", "description": "Победы в пистолетных раундах."},
    {"id": "full_buy_win_pct", "ru": "Фулл-бай, %", "unit": "pct", "better": "higher", "description": "Победы при полном закупе команды."},
    {"id": "force_win_pct", "ru": "Форс, %", "unit": "pct", "better": "higher", "description": "Победы при форс-баях."},
    {"id": "eco_win_pct", "ru": "Эко, %", "unit": "pct", "better": "higher", "description": "Победы на эко."},
    {"id": "anti_eco_win_pct", "ru": "Анти-эко, %", "unit": "pct", "better": "higher", "description": "Победы, когда у соперника эко, а у нас нет."},
    {"id": "opening_win_pct", "ru": "5v4 конверсия", "unit": "pct", "better": "higher", "description": "Победы после первого убийства команды."},
    {"id": "opening_loss_win_pct", "ru": "4v5 камбэки", "unit": "pct", "better": "higher", "description": "Победы после первой смерти команды."},
    {"id": "post_plant_win_pct", "ru": "Пост-плант, %", "unit": "pct", "better": "higher", "description": "Победы после установки бомбы (T)."},
    {"id": "retake_win_pct", "ru": "Ретейки, %", "unit": "pct", "better": "higher", "description": "Победы CT после установки бомбы."},
    {"id": "avg_first_contact", "ru": "Первый контакт, с", "unit": "sec", "better": "neutral", "description": "Секунд от фризтайма до первого урона в раунде."},
    {"id": "avg_plant_time", "ru": "Время планта, с", "unit": "sec", "better": "neutral", "description": "Секунд от фризтайма до планта."},
    {"id": "traded_death_pct", "ru": "Размены, %", "unit": "pct", "better": "higher", "description": "Доля разменянных смертей."},
    {"id": "utility_per_round", "ru": "Утилити за раунд", "unit": "ratio", "better": "higher", "description": "Гранат на раунд (вся команда)."},
    {"id": "utility_damage_per_round", "ru": "Урон утилити за раунд", "unit": "num", "better": "higher", "description": "Урон гранатами за раунд."},
    {"id": "flash_assists", "ru": "Флеш-ассисты", "unit": "num", "better": "higher", "description": "Флеш-ассисты за матч."},
]
