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
- `sprite sync reaction` — reducer вместе с reaction и чтением данных другого actor.

В обычном режиме сценарии запускаются на `10_000` и `50_000` строках. Gate benchmark сравнивает публичный путь `@lite-fsm/entities` с ручным SoA baseline и проверяет ratio-budget. Diagnostics benchmark раскладывает стоимость по слоям: `raw-soa`, `semantic-soa`, `raw-entity-kernel`, `public-transition`.

### Быстрый цикл

```bash
pnpm run bench:entities:record -- --label before
# внести оптимизацию
pnpm run bench:entities:record -- --label after
pnpm run bench:entities:compare -- .bench/entities/before.json .bench/entities/after.json
```

`record` также обновляет `.bench/entities/latest.json` и `.bench/entities/latest.md`. Директория `.bench/` игнорируется Git.

### Полезные варианты

```bash
pnpm run bench:entities:record -- --runs 5
pnpm run bench:entities:record -- --out .bench/entities
pnpm run bench:entities:record -- --include gate
pnpm run bench:entities:record -- --include diagnostics
pnpm run bench:entities:record -- --include gate,diagnostics
```

По умолчанию `record` запускает `3` прогона и включает `gate,diagnostics`.

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

Для diagnostics benchmark сравниваются:

- `median` каждого layer;
- `ratioToRawSoa` каждого layer.

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
- результаты `gate` и/или `diagnostics`;
- raw samples и summary across runs.

### Стабильность измерений

`record` агрегирует несколько прогонов через median-of-medians. Markdown summary показывает warnings, если:

- разброс median across runs выше `15%`;
- baseline или raw SoA median ниже `0.05ms`, то есть близок к шуму таймера.

Browser benchmark не входит в стабильный Node record. Его можно запускать отдельно:

```bash
pnpm run bench:entities:browser
```

### Smoke-проверка скриптов

Для быстрой локальной проверки без полного набора строк есть служебный флаг `--row-counts`:

```bash
pnpm run bench:entities:record -- --runs 1 --label smoke --include gate,diagnostics --row-counts 1000
pnpm run bench:entities:compare -- .bench/entities/smoke.json .bench/entities/smoke.json
```

Обычный режим использует row counts из fixtures.
