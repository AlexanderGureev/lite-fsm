# Benchmark

Директория содержит benchmark-сценарии и вспомогательные скрипты для проверки производительности.

## `@lite-fsm/entities`

Основной workflow истории производительности сохраняет машинно-читаемый отчет и Markdown summary в `.bench/entities/`.

### Что измеряется

Benchmark проверяет репрезентативный composition-сценарий: тысячи сущностей обрабатываются через `entitiesPlugin`, entity storage и обычный `manager.transition`.

Сценарии покрывают четыре типовые нагрузки:

- `movement update` — массовое обновление числовых колонок;
- `projectile lifetime update` — простой reducer без удаления сущностей;
- `despawnOn cleanup` — переход в состояние удаления и очистка entity storage;
- `unit frame composition` — кадр игрового юнита с `movement`, `sprite`, `health`, `targeting`, reaction, effect, `getState()`, `entities()` и внешним adapter через deps.

В обычном режиме сценарии запускаются на `10_000` и `50_000` строках. Gate benchmark сравнивает публичный путь `@lite-fsm/entities` с ручным SoA baseline и проверяет ratio-budget.

Trace benchmark включается через `--include trace` и измеряет тот же production public path `manager.transition(...)`, что и сценарии gate. Collector добавляет overhead, поэтому абсолютные значения trace не смешиваются с gate median. Gate остается основным budget check; trace нужен для attribution и выбора следующего шага оптимизации.

Отдельный spawn workflow включается через `--include spawn,spawn-trace`. Он измеряет один массовый RTS-подобный spawn transition на свежем manager: каждая entity создает пять actor rows (`unitIdentity`, `unitMovement`, `unitHealth`, `unitCombat`, `enemyAi`). В этом workflow `--row-counts` означает количество entities, а отчет также показывает количество actor rows.

Historical diagnostics artifacts с `results.diagnostics` являются legacy synthetic data. Они читаются `compare` для сопоставления старых records, но текущий optimization workflow не создает diagnostics section и не использует `raw entity kernel` как источник production attribution.

### Быстрый цикл

```bash
pnpm run bench:entities:record -- --label before
# внести оптимизацию
pnpm run bench:entities:record -- --label after
pnpm run bench:entities:compare -- .bench/entities/before.json .bench/entities/after.json
```

`record` также обновляет `.bench/entities/latest.json` и `.bench/entities/latest.md`. Директория `.bench/` игнорируется Git.

### Trace workflow

Основной active baseline для trace фиксируется только на `50_000` строках:

```bash
pnpm run bench:entities:record -- --runs 3 --label unit-composition-baseline --include gate,trace --row-counts 50000
```

После оптимизации сохраняй отдельный record и сравнивай его с baseline:

```bash
pnpm run bench:entities:record -- --runs 5 --label <short-name> --include gate,trace --row-counts 50000
pnpm run bench:entities:compare -- .bench/entities/unit-composition-baseline.json .bench/entities/<short-name>.json
```

`traceTotal / gateEntityMedian` связывает trace total с gate median того же scenario и row count. Предупреждение `traceTotal / gateEntityMedian > 2.00x` означает, что instrumentation overhead стал слишком большим для качественного attribution; это guard качества разметки, а не performance budget.

Trace phases сохраняются плоским списком с `parentKey`. Child phases показывают состав parent phase и уже входят в ее время, поэтому child phases нельзя суммировать с parent как общий total. Coverage считает заранее выбранные non-overlapping child sets из per-transition сумм; его нельзя восстанавливать как сумму median отдельных child phases.

### Полезные варианты

```bash
pnpm run bench:entities:record -- --runs 5
pnpm run bench:entities:record -- --out .bench/entities
pnpm run bench:entities:record -- --include gate
pnpm run bench:entities:record -- --include trace
pnpm run bench:entities:record -- --include gate,trace
pnpm run bench:entities:record -- --runs 1 --label spawn-baseline --include spawn,spawn-trace --row-counts 35000
```

По умолчанию `record` запускает `3` прогона и включает `gate,trace`.

Legacy synthetic diagnostics запускается отдельной командой и не участвует в record workflow:

```bash
pnpm run bench:entities:legacy-diagnostics
```

### Что делает `record`

1. Точечно собирает production dist для `@lite-fsm/core` и `@lite-fsm/entities`.
2. Запускает выбранные Node benchmark-сценарии без browser benchmark.
3. Сохраняет JSON с metadata окружения, raw samples каждого run и агрегированными summary.
4. Сохраняет Markdown summary для PR или ручного переноса в `packages/entities/PERFORMANCE.md`.
5. Не падает из-за `fail` статуса performance gate: отчет сохраняется, чтобы результат можно было сравнить.

Команда падает только при runtime error, некорректном результате или ошибке записи отчета.

### Что сравнивает `compare`

`compare` читает два JSON-отчета и печатает Markdown в stdout.

Для gate benchmark сравниваются:

- `entity median`;
- `ratio`;
- `baseline median`.

Для legacy diagnostics benchmark в старых records сравниваются:

- `median` каждого layer;
- `ratioToRawSoa` каждого layer.

Для trace benchmark сравниваются:

- `median` каждой flat phase;
- share phase относительно transition или parent;
- total trace scenario и `traceTotal / gateEntityMedian`, если оба отчета содержат gate.

Для spawn benchmark сравниваются:

- `total median`;
- `total p95`.

Изменения больше `10%` выделяются в таблице. По умолчанию compare не завершает процесс с ошибкой при регрессии.

### Формат отчетов

Один запуск создает:

```text
.bench/entities/<timestamp>-<label>.json
.bench/entities/<timestamp>-<label>.md
.bench/entities/latest.json
.bench/entities/latest.md
```

Если передан `--label`, дополнительно создаются удобные alias-файлы:

```text
.bench/entities/<label>.json
.bench/entities/<label>.md
```

JSON использует `schemaVersion: 1` и содержит:

- дату создания;
- git sha, branch и dirty status;
- Node, OS, arch, CPU и package manager;
- argv, cwd, количество runs и include-набор;
- результаты `gate` и/или `trace`; старые records могут содержать legacy `diagnostics`;
- результаты `spawn`, если был выбран spawn workflow;
- raw samples и summary across runs.

### Стабильность измерений

`record` агрегирует несколько прогонов через median-of-medians. Markdown summary показывает warnings, если:

- разброс median across runs выше `15%`;
- baseline или raw SoA median ниже `0.05ms`, то есть близок к шуму таймера.
- `traceTotal / gateEntityMedian` выше `2.00x`.

Browser benchmark не входит в стабильный Node record. Его можно запускать отдельно:

```bash
pnpm run bench:entities:browser
```

### Smoke-проверка скриптов

Для быстрой локальной проверки без полного набора строк есть служебный флаг `--row-counts`:

```bash
pnpm run bench:entities:record -- --runs 1 --label smoke --include gate,trace --row-counts 1000
pnpm run bench:entities:compare -- .bench/entities/smoke.json .bench/entities/smoke.json
```

Trace smoke:

```bash
pnpm run bench:entities:record -- --runs 1 --label trace-smoke --include trace --row-counts 1000
pnpm run bench:entities:compare -- .bench/entities/trace-smoke.json .bench/entities/trace-smoke.json
```

Обычный режим использует row counts из fixtures.
